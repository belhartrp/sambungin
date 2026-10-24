import { describe, expect, it, vi } from 'vitest';
import {
  SpeechController,
  browserRecognitionFactory,
  classifySpeechError,
  isSpeechSupported,
  type RecognitionEventLike,
  type RecognitionLike,
  type SpeechError,
  type SpeechState,
} from '@/lib/speech/controller';
import { parseTranscript, resolveMark, spellToPrefix, type IntentContext } from '@/lib/speech/intent';
import type { LookupMatch } from '@/lib/types';
import { makeEngine } from './helpers';

const ctx = (over: Partial<IntentContext> = {}): IntentContext => ({
  mode: 'prefix', voiceCommands: true, spelling: true, ...over,
});

describe('mode Cari awalan: ucapan menjadi awalan', () => {
  it('huruf tunggal, rangkaian, dan nama huruf Indonesia/Inggris', () => {
    expect(parseTranscript('a', ctx())).toEqual({ type: 'prefix', prefix: 'a' });
    expect(parseTranscript('ab', ctx())).toEqual({ type: 'prefix', prefix: 'ab' });
    expect(parseTranscript('abs', ctx())).toEqual({ type: 'prefix', prefix: 'abs' });
    expect(parseTranscript('A B S', ctx())).toEqual({ type: 'prefix', prefix: 'abs' });
    expect(parseTranscript('a be es', ctx())).toEqual({ type: 'prefix', prefix: 'abs' });
    expect(parseTranscript('ay bee ess', ctx())).toEqual({ type: 'prefix', prefix: 'abs' });
    expect(parseTranscript('double u, ex', ctx())).toEqual({ type: 'prefix', prefix: 'wx' });
  });

  it('tanda baca dan spasi tambahan dibersihkan', () => {
    expect(parseTranscript('  A.  B,  ', ctx())).toEqual({ type: 'prefix', prefix: 'ab' });
  });

  it('pengenalan nama huruf dapat dimatikan agar awalan utuh seperti "es" tetap literal', () => {
    expect(spellToPrefix('es', true)).toBe('s');
    expect(spellToPrefix('es', false)).toBe('es');
  });

  it('ucapan kosong atau tanpa huruf menghasilkan empty', () => {
    expect(parseTranscript('', ctx())).toEqual({ type: 'empty' });
    expect(parseTranscript('123 !!', ctx())).toEqual({ type: 'empty' });
  });

  it('awalan TIDAK pernah dianggap kata terpakai', () => {
    for (const t of ['ab', 'absolute', 'enemy']) {
      expect(parseTranscript(t, ctx({ mode: 'prefix' })).type).toBe('prefix');
    }
  });
});

describe('mode Tandai kata dan perintah suara', () => {
  it('di mode tandai, ucapan utuh dianggap kata', () => {
    expect(parseTranscript('absolute', ctx({ mode: 'mark' }))).toEqual({ type: 'mark', text: 'absolute' });
    expect(parseTranscript('kata enemy', ctx({ mode: 'mark' }))).toEqual({ type: 'mark', text: 'enemy' });
    expect(parseTranscript('paut memaut', ctx({ mode: 'mark' }))).toEqual({ type: 'mark', text: 'paut memaut' });
  });

  it('perintah "tandai X" bekerja di mode apa pun', () => {
    expect(parseTranscript('tandai enemy', ctx({ mode: 'prefix' }))).toEqual({ type: 'mark', text: 'enemy' });
    expect(parseTranscript('mark absolute', ctx({ mode: 'prefix' }))).toEqual({ type: 'mark', text: 'absolute' });
    expect(parseTranscript('sudah dipakai abadi', ctx())).toEqual({ type: 'mark', text: 'abadi' });
  });

  it('perintah "cari X" mencari awalan walau di mode tandai', () => {
    expect(parseTranscript('cari a be', ctx({ mode: 'mark' }))).toEqual({ type: 'prefix', prefix: 'ab' });
    expect(parseTranscript('starts with a b', ctx({ mode: 'mark' }))).toEqual({ type: 'prefix', prefix: 'ab' });
  });

  it('perintah tunggal: undo, hapus, ganti mode', () => {
    expect(parseTranscript('batalkan', ctx())).toEqual({ type: 'command', command: 'undo' });
    expect(parseTranscript('undo', ctx())).toEqual({ type: 'command', command: 'undo' });
    expect(parseTranscript('hapus', ctx())).toEqual({ type: 'command', command: 'clear' });
    expect(parseTranscript('tandai', ctx())).toEqual({ type: 'command', command: 'mode-mark' });
    expect(parseTranscript('cari', ctx({ mode: 'mark' }))).toEqual({ type: 'command', command: 'mode-search' });
  });

  it('perintah suara dimatikan: kata perintah diperlakukan sebagai awalan biasa', () => {
    expect(parseTranscript('undo', ctx({ voiceCommands: false }))).toEqual({ type: 'prefix', prefix: 'undo' });
    expect(parseTranscript('tandai enemy', ctx({ voiceCommands: false, mode: 'prefix' })).type).toBe('prefix');
  });
});

describe('resolveMark: konfirmasi bila tidak yakin', () => {
  const engine = makeEngine(['abadi'], ['enemy', 'envy']);
  const lookup = (k: string): LookupMatch[] => engine.lookup([k], ['id', 'en'])[0]!;
  const alt = (transcript: string, confidence = 0.95) => ({ transcript, confidence });
  const opts = { preferLang: 'en' as const };

  it('yakin dan ada di dataset -> tandai langsung', () => {
    const r = resolveMark([alt('enemy')], lookup, opts);
    expect(r).toMatchObject({ status: 'confident', match: { word: 'enemy', lang: 'en' } });
  });

  it('keyakinan rendah -> minta konfirmasi', () => {
    const r = resolveMark([alt('enemy', 0.4)], lookup, opts);
    expect(r.status).toBe('confirm');
  });

  it('keyakinan 0 (tidak dilaporkan browser) tidak dianggap rendah', () => {
    expect(resolveMark([alt('enemy', 0)], lookup, opts).status).toBe('confident');
  });

  it('hanya alternatif lain yang ada di dataset -> konfirmasi dengan pilihan', () => {
    const r = resolveMark([alt('enemi'), alt('enemy', 0.5)], lookup, opts);
    expect(r.status).toBe('confirm');
    if (r.status === 'confirm') expect(r.choices.map((c) => c.word)).toContain('enemy');
  });

  it('tidak ada di dataset -> unknown agar bisa ditawarkan sebagai kata khusus', () => {
    const r = resolveMark([alt('zzzyx')], lookup, opts);
    expect(r).toMatchObject({ status: 'unknown', key: 'zzzyx' });
  });

  it('kata di dua bahasa: suara memilih bahasa pengenalan, ketikan bertanya', () => {
    const e = makeEngine(['hotel'], ['hotel']);
    const both = (k: string): LookupMatch[] => e.lookup([k], ['id', 'en'])[0]!;
    const voice = resolveMark([alt('hotel')], both, { preferLang: 'id', ambiguous: 'prefer' });
    expect(voice).toMatchObject({ status: 'confident', match: { lang: 'id' } });
    const typed = resolveMark([alt('hotel')], both, { preferLang: 'id', ambiguous: 'ask' });
    expect(typed.status).toBe('confirm');
    if (typed.status === 'confirm') expect(typed.choices).toHaveLength(2);
  });

  it('transkrip kosong -> unknown tanpa kunci', () => {
    expect(resolveMark([alt('  ')], lookup, opts)).toMatchObject({ status: 'unknown', key: '' });
  });
});

/* -------------------------------------------------- Pengendali dengan API palsu */

class FakeRecognition implements RecognitionLike {
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((ev: { error: string }) => void) | null = null;
  onresult: ((ev: RecognitionEventLike) => void) | null = null;
  starts = 0;
  start = vi.fn(() => {
    this.starts++;
    queueMicrotask(() => this.onstart?.());
  });
  stop = vi.fn(() => queueMicrotask(() => this.onend?.()));
  abort = vi.fn(() => queueMicrotask(() => this.onend?.()));

  emit(results: Array<{ isFinal: boolean; alts: Array<[string, number]> }>, resultIndex = 0): void {
    const list = results.map((r) => {
      const res: Record<number, { transcript: string; confidence: number }> & { isFinal: boolean; length: number } = {
        isFinal: r.isFinal, length: r.alts.length,
      };
      r.alts.forEach(([transcript, confidence], i) => (res[i] = { transcript, confidence }));
      return res;
    });
    this.onresult?.({ resultIndex, results: Object.assign(list, { length: list.length }) });
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function setup(supported = true) {
  const rec = new FakeRecognition();
  const factory = vi.fn(() => rec as RecognitionLike);
  const states: SpeechState[] = [];
  const errors: SpeechError[] = [];
  const interim: string[] = [];
  const finals: Array<Array<{ transcript: string; confidence: number }>> = [];
  const c = new SpeechController(
    factory,
    {
      onState: (s, e) => {
        states.push(s);
        if (e) errors.push(e);
      },
      onInterim: (t) => interim.push(t),
      onFinal: (a) => finals.push(a),
    },
    supported,
  );
  return { rec, factory, c, states, errors, interim, finals };
}

describe('SpeechController', () => {
  it('dukungan terdeteksi tanpa membuat instance (tanpa izin mikrofon)', () => {
    expect(isSpeechSupported({})).toBe(false);
    expect(isSpeechSupported(undefined)).toBe(false);
    expect(isSpeechSupported({ webkitSpeechRecognition: function () {} })).toBe(true);
    const factory = browserRecognitionFactory({});
    expect(factory()).toBeNull();
    const s = setup();
    expect(s.factory).not.toHaveBeenCalled();
  });

  it('tidak mendukung: start tidak melakukan apa pun dan status unsupported', () => {
    const s = setup(false);
    s.c.start({ lang: 'id-ID', continuous: false });
    expect(s.c.state).toBe('unsupported');
    expect(s.factory).not.toHaveBeenCalled();
  });

  it('start mengatur bahasa lalu berstatus listening', async () => {
    const s = setup();
    s.c.start({ lang: 'id-ID', continuous: false });
    expect(s.c.state).toBe('starting');
    await tick();
    expect(s.c.state).toBe('listening');
    expect(s.rec.lang).toBe('id-ID');
    expect(s.rec.interimResults).toBe(true);
  });

  it('instance dipakai ulang di seluruh sesi (izin tidak diminta berulang)', async () => {
    const s = setup();
    s.c.start({ lang: 'id-ID', continuous: false });
    await tick();
    s.c.stop();
    await tick();
    s.c.start({ lang: 'en-US', continuous: false });
    await tick();
    expect(s.factory).toHaveBeenCalledTimes(1);
    expect(s.rec.starts).toBe(2);
    expect(s.rec.lang).toBe('en-US');
  });

  it('hasil sementara hanya menjadi pratinjau, tidak pernah memicu onFinal', async () => {
    const s = setup();
    s.c.start({ lang: 'id-ID', continuous: false });
    await tick();
    s.rec.emit([{ isFinal: false, alts: [['abs', 0]] }]);
    s.rec.emit([{ isFinal: false, alts: [['absol', 0]] }]);
    expect(s.interim).toEqual(['abs', 'absol']);
    expect(s.finals).toHaveLength(0);
  });

  it('hasil final meneruskan seluruh alternatif beserta keyakinan', async () => {
    const s = setup();
    s.c.start({ lang: 'en-US', continuous: false });
    await tick();
    s.rec.emit([{ isFinal: true, alts: [['enemy', 0.92], ['any me', 0.4]] }]);
    expect(s.finals).toEqual([[{ transcript: 'enemy', confidence: 0.92 }, { transcript: 'any me', confidence: 0.4 }]]);
  });

  it('mode continuous meneruskan beberapa hasil final berurutan', async () => {
    const s = setup();
    s.c.start({ lang: 'id-ID', continuous: true });
    await tick();
    s.rec.emit([{ isFinal: true, alts: [['abu', 0.9]] }]);
    s.rec.emit([{ isFinal: true, alts: [['abu', 0.9]] }, { isFinal: true, alts: [['enak', 0.9]] }], 1);
    expect(s.finals.map((f) => f[0]!.transcript)).toEqual(['abu', 'enak']);
    expect(s.rec.continuous).toBe(true);
  });

  it('izin ditolak -> status error dengan pesan yang bisa ditindaklanjuti', async () => {
    const s = setup();
    s.c.start({ lang: 'id-ID', continuous: false });
    await tick();
    s.rec.onerror?.({ error: 'not-allowed' });
    s.rec.onend?.();
    expect(s.c.state).toBe('error');
    expect(s.errors[0]!.kind).toBe('permission-denied');
    expect(s.errors[0]!.message).toContain('mengetik');
  });

  it('no-speech tidak fatal: kembali idle', async () => {
    const s = setup();
    s.c.start({ lang: 'id-ID', continuous: false });
    await tick();
    s.rec.onerror?.({ error: 'no-speech' });
    expect(s.c.state).toBe('idle');
    expect(s.errors[0]!.kind).toBe('no-speech');
  });

  it('"aborted" dari aplikasi sendiri tidak dilaporkan sebagai galat', () => {
    expect(classifySpeechError('aborted')).toBeNull();
    expect(classifySpeechError('audio-capture')).toBe('no-microphone');
    expect(classifySpeechError('network')).toBe('network');
    expect(classifySpeechError('language-not-supported')).toBe('language');
    expect(classifySpeechError('apa-saja')).toBe('unknown');
  });

  it('start saat aktif dengan bahasa baru menghentikan lalu memulai ulang', async () => {
    const s = setup();
    s.c.start({ lang: 'id-ID', continuous: false });
    await tick();
    s.c.start({ lang: 'en-US', continuous: false });
    await tick();
    await tick();
    expect(s.rec.stop).toHaveBeenCalledTimes(1);
    expect(s.rec.starts).toBe(2);
    expect(s.rec.lang).toBe('en-US');
  });

  it('start yang melempar galat (InvalidStateError) menghasilkan status error', () => {
    const s = setup();
    s.rec.start.mockImplementationOnce(() => {
      throw new Error('InvalidStateError');
    });
    s.c.start({ lang: 'id-ID', continuous: false });
    expect(s.c.state).toBe('error');
  });

  it('dispose melepas semua penangan', async () => {
    const s = setup();
    s.c.start({ lang: 'id-ID', continuous: false });
    await tick();
    s.c.dispose();
    expect(s.rec.onresult).toBeNull();
    expect(s.rec.onend).toBeNull();
  });
});
