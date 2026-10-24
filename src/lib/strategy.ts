import type { KindCode } from './types';

/**
 * Strategi menyulitkan lawan (heuristic scoring).
 *
 * Untuk setiap kandidat kata W dengan akhiran T (N huruf terakhir sesuai aturan sambungan):
 *
 *   continuationCount(W) = jumlah kata valid yang dimulai dengan T, belum terpakai, berasal
 *                          dari bahasa aktif, dan dikenal pada tingkat kosakata lawan,
 *                          di luar W sendiri (W menjadi terpakai begitu dimainkan)
 *
 * Skor (0-100) adalah rata-rata berbobot dari komponen yang AKTIF:
 *
 *   ending   = 1 / (1 + ln(1 + c))          c kecil -> mendekati 1; c = 0 (buntu) -> 1
 *   validity = {tingkat 1: 1.0, 2: 0.8, 3: 0.55}; populer/singkatan 0.5; nama 0.6; khusus 0.9
 *   length   = panjang kata terhadap batas 14 huruf (lebih panjang atau lebih pendek)
 *
 * Bobot: ending 0.70, validity 0.20, length 0.10. Bobot dinormalisasi terhadap komponen yang
 * aktif sehingga mematikan satu opsi benar-benar mengubah urutan hasil.
 *
 * Skor bukan jaminan kemenangan: ia hanya menjelaskan seberapa sedikit pilihan lanjutan yang
 * tersisa menurut dataset dan perkiraan kosakata lawan.
 */

export interface StrategyOptions {
  /** Saklar utama rekomendasi menyulitkan lawan. */
  enabled: boolean;
  prioritizeHardEndings: boolean;
  considerLength: boolean;
  lengthPreference: 'longer' | 'shorter';
  preferValidWords: boolean;
  /** Hitung dan tampilkan jumlah kelanjutan walau tidak dipakai untuk skor. */
  showContinuation: boolean;
}

export const DEFAULT_STRATEGY: StrategyOptions = {
  enabled: true,
  prioritizeHardEndings: true,
  considerLength: false,
  lengthPreference: 'longer',
  preferValidWords: true,
  showContinuation: true,
};

export const WEIGHTS = { ending: 0.7, validity: 0.2, length: 0.1 } as const;
const LENGTH_CAP = 14;

/** Apakah jumlah kelanjutan perlu dihitung untuk konfigurasi ini. */
export function needsContinuation(o: StrategyOptions): boolean {
  return o.showContinuation || (o.enabled && o.prioritizeHardEndings);
}

/** Apakah skor strategi dihitung untuk konfigurasi ini. */
export function isScoring(o: StrategyOptions): boolean {
  return o.enabled && (o.prioritizeHardEndings || o.preferValidWords || o.considerLength);
}

export function endingScore(continuation: number): number {
  return 1 / (1 + Math.log(1 + Math.max(0, continuation)));
}

export function validityScore(tier: number, kind: KindCode): number {
  switch (kind) {
    case 'p':
    case 's':
      return 0.5;
    case 'n':
      return 0.6;
    case 'c':
      return 0.9;
    default:
      return tier <= 1 ? 1 : tier === 2 ? 0.8 : 0.55;
  }
}

export function lengthScore(length: number, pref: 'longer' | 'shorter'): number {
  const l = Math.min(Math.max(length, 2), LENGTH_CAP);
  const longer = (l - 2) / (LENGTH_CAP - 2);
  return pref === 'longer' ? longer : 1 - longer;
}

export interface CandidateFacts {
  /** Jumlah kelanjutan; null bila tidak dihitung. */
  continuation: number | null;
  tier: number;
  kind: KindCode;
  length: number;
}

/** Skor 0-100, atau null bila strategi mati atau tidak ada komponen aktif. */
export function scoreCandidate(f: CandidateFacts, o: StrategyOptions): number | null {
  if (!isScoring(o)) return null;
  let sum = 0;
  let weight = 0;
  if (o.prioritizeHardEndings && f.continuation !== null) {
    sum += WEIGHTS.ending * endingScore(f.continuation);
    weight += WEIGHTS.ending;
  }
  if (o.preferValidWords) {
    sum += WEIGHTS.validity * validityScore(f.tier, f.kind);
    weight += WEIGHTS.validity;
  }
  if (o.considerLength) {
    sum += WEIGHTS.length * lengthScore(f.length, o.lengthPreference);
    weight += WEIGHTS.length;
  }
  if (weight === 0) return null;
  return (100 * sum) / weight;
}

export type Difficulty = 'buntu' | 'sangat-sulit' | 'sulit' | 'sedang' | 'mudah';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  buntu: 'Buntu',
  'sangat-sulit': 'Sangat sulit',
  sulit: 'Sulit',
  sedang: 'Sedang',
  mudah: 'Mudah',
};

/** Tingkat kesulitan lanjutan bagi lawan berdasarkan jumlah kelanjutan. */
export function difficultyOf(continuation: number): Difficulty {
  if (continuation <= 0) return 'buntu';
  if (continuation <= 3) return 'sangat-sulit';
  if (continuation <= 20) return 'sulit';
  if (continuation <= 150) return 'sedang';
  return 'mudah';
}

const nf = new Intl.NumberFormat('id-ID');
export const formatCount = (n: number): string => nf.format(n);

/** Alasan rekomendasi yang dapat ditelusuri ke angka nyata dari dataset. */
export function explain(f: CandidateFacts & { tail: string }): string[] {
  const notes: string[] = [];
  const c = f.continuation;
  if (c !== null) {
    if (c === 0) notes.push(`Tidak ada kata lanjutan berawalan “${f.tail}” di dataset.`);
    else if (c === 1) notes.push(`Pilihan lanjutan hanya 1 kata, berawalan “${f.tail}”.`);
    else if (c <= 20) notes.push(`Pilihan lanjutan hanya ${formatCount(c)} kata.`);
    else notes.push(`Lawan masih punya ${formatCount(c)} pilihan berawalan “${f.tail}”.`);
  }
  if (f.kind === 'p' || f.kind === 's') {
    notes.push('Kata tidak baku atau singkatan, ada risiko tidak diterima.');
  } else if (f.kind === 'n') {
    notes.push('Nama tempat, periksa apakah aturan permainan mengizinkan.');
  } else if (f.kind === 'c') {
    notes.push('Kata khusus yang Anda tambahkan.');
  } else if (f.tier >= 3) {
    notes.push('Kata jarang, ada risiko tidak diterima.');
  }
  return notes;
}
