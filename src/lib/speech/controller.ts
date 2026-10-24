import type { Alternative } from './intent';

/**
 * Pembungkus Web Speech API yang tidak bergantung pada React.
 *
 * Keputusan desain:
 *  - Instance SpeechRecognition dibuat malas saat pengguna pertama kali menekan mikrofon dan
 *    dipakai ulang sesudahnya, sehingga izin tidak diminta berulang tanpa alasan.
 *  - Tidak ada pemanggilan getUserMedia sebelum pengguna memilih memakai suara.
 *  - Hasil sementara (interim) hanya diteruskan sebagai teks pratinjau. Hanya hasil final yang
 *    boleh memicu pencarian permanen atau perubahan riwayat.
 *  - Tidak ada restart otomatis: bila browser mengakhiri sesi, status kembali ke idle dan
 *    pengguna menekan mikrofon lagi.
 */

export interface RecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}
export interface RecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: RecognitionAlternativeLike;
}
export interface RecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: RecognitionResultLike };
}
export interface RecognitionErrorLike {
  error: string;
  message?: string;
}

export interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: RecognitionErrorLike) => void) | null;
  onresult: ((ev: RecognitionEventLike) => void) | null;
}

export type RecognitionFactory = () => RecognitionLike | null;

type SpeechCtor = new () => RecognitionLike;
interface SpeechWindow {
  SpeechRecognition?: SpeechCtor;
  webkitSpeechRecognition?: SpeechCtor;
}

/** Deteksi dukungan tanpa membuat instance dan tanpa meminta izin. */
export function isSpeechSupported(win: unknown = typeof window !== 'undefined' ? window : undefined): boolean {
  const w = win as SpeechWindow | undefined;
  return Boolean(w && (w.SpeechRecognition || w.webkitSpeechRecognition));
}

export function browserRecognitionFactory(
  win: unknown = typeof window !== 'undefined' ? window : undefined,
): RecognitionFactory {
  return () => {
    const w = win as SpeechWindow | undefined;
    const Ctor = w?.SpeechRecognition ?? w?.webkitSpeechRecognition;
    return Ctor ? new Ctor() : null;
  };
}

export type SpeechState = 'unsupported' | 'idle' | 'starting' | 'listening' | 'error';

export type SpeechErrorKind =
  | 'permission-denied'
  | 'no-speech'
  | 'no-microphone'
  | 'network'
  | 'language'
  | 'unknown';

export interface SpeechError {
  kind: SpeechErrorKind;
  message: string;
}

export const SPEECH_ERROR_MESSAGE: Record<SpeechErrorKind, string> = {
  'permission-denied':
    'Izin mikrofon ditolak. Izinkan mikrofon pada pengaturan situs browser, lalu tekan mikrofon lagi. Anda tetap bisa mengetik.',
  'no-speech': 'Tidak ada suara yang terdengar. Tekan mikrofon dan coba lagi.',
  'no-microphone': 'Mikrofon tidak ditemukan atau sedang dipakai aplikasi lain.',
  network:
    'Layanan pengenalan suara browser tidak dapat dijangkau. Periksa koneksi internet, atau ketik secara manual.',
  language: 'Bahasa ini tidak didukung oleh pengenalan suara di browser Anda.',
  unknown: 'Pengenalan suara gagal. Coba lagi, atau ketik secara manual.',
};

export function classifySpeechError(code: string): SpeechErrorKind | null {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'permission-denied';
    case 'no-speech':
      return 'no-speech';
    case 'audio-capture':
      return 'no-microphone';
    case 'network':
      return 'network';
    case 'language-not-supported':
      return 'language';
    case 'aborted':
      return null; // dibatalkan oleh aplikasi sendiri, bukan galat
    default:
      return 'unknown';
  }
}

export interface SpeechHandlers {
  onState: (state: SpeechState, error?: SpeechError) => void;
  onInterim: (text: string) => void;
  onFinal: (alternatives: Alternative[]) => void;
}

export interface StartOptions {
  /** Kode bahasa BCP 47, mis. id-ID atau en-US. */
  lang: string;
  continuous: boolean;
}

export class SpeechController {
  private rec: RecognitionLike | null = null;
  private current: SpeechState;
  private pending: StartOptions | null = null;
  private lastError: SpeechError | null = null;

  constructor(
    private readonly factory: RecognitionFactory,
    private readonly handlers: SpeechHandlers,
    supported: boolean = true,
  ) {
    this.current = supported ? 'idle' : 'unsupported';
  }

  get state(): SpeechState {
    return this.current;
  }

  get active(): boolean {
    return this.current === 'starting' || this.current === 'listening';
  }

  private setState(next: SpeechState, error?: SpeechError): void {
    this.current = next;
    this.handlers.onState(next, error);
  }

  private ensure(): RecognitionLike | null {
    if (this.rec) return this.rec;
    const rec = this.factory();
    if (!rec) return null;
    rec.interimResults = true;
    rec.maxAlternatives = 5;

    rec.onstart = () => this.setState('listening');

    rec.onend = () => {
      if (this.pending) {
        const next = this.pending;
        this.pending = null;
        // Sesi lama sudah berakhir. Tanpa reset ini start() menganggap sesi masih aktif,
        // menghentikannya lagi, dan terjadi loop tak berujung.
        this.current = 'idle';
        this.start(next);
        return;
      }
      // Bila galat sudah dilaporkan, pertahankan status error sampai start berikutnya.
      if (this.current !== 'error') this.setState('idle');
    };

    rec.onerror = (ev) => {
      const kind = classifySpeechError(ev.error);
      if (kind === null) return;
      const error = { kind, message: SPEECH_ERROR_MESSAGE[kind] };
      this.lastError = error;
      // "no-speech" tidak fatal: kembali ke idle dengan pesan ringan.
      this.setState(kind === 'no-speech' ? 'idle' : 'error', error);
    };

    rec.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i];
        if (!result || result.length === 0) continue;
        if (result.isFinal) {
          const alts: Alternative[] = [];
          for (let j = 0; j < result.length; j++) {
            const a = result[j];
            if (a && a.transcript.trim()) alts.push({ transcript: a.transcript, confidence: a.confidence ?? 0 });
          }
          if (alts.length > 0) this.handlers.onFinal(alts);
        } else {
          interim += result[0]?.transcript ?? '';
        }
      }
      if (interim) this.handlers.onInterim(interim);
    };

    this.rec = rec;
    return rec;
  }

  start(opts: StartOptions): void {
    if (this.current === 'unsupported') return;
    if (this.active) {
      // Ganti bahasa atau mode saat aktif: hentikan dulu, lalu mulai ulang setelah onend.
      this.pending = opts;
      this.rec?.stop();
      return;
    }
    const rec = this.ensure();
    if (!rec) {
      this.setState('unsupported');
      return;
    }
    rec.lang = opts.lang;
    rec.continuous = opts.continuous;
    this.lastError = null;
    this.setState('starting');
    try {
      rec.start();
    } catch {
      const error = { kind: 'unknown' as const, message: SPEECH_ERROR_MESSAGE.unknown };
      this.setState('error', error);
    }
  }

  /** Mengakhiri sesi dan tetap memproses ucapan yang sudah ditangkap. */
  stop(): void {
    this.pending = null;
    this.rec?.stop();
  }

  /** Membatalkan sesi tanpa memproses sisa ucapan. */
  abort(): void {
    this.pending = null;
    this.rec?.abort();
  }

  /** Membersihkan penangan saat komponen dilepas. */
  dispose(): void {
    this.pending = null;
    if (this.rec) {
      this.rec.onstart = null;
      this.rec.onend = null;
      this.rec.onerror = null;
      this.rec.onresult = null;
      try {
        this.rec.abort();
      } catch {
        /* abaikan */
      }
      this.rec = null;
    }
  }

  get error(): SpeechError | null {
    return this.lastError;
  }
}
