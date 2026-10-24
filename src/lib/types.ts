/** Bahasa kosakata. Indeks numerik dipakai di struktur data kolom (Uint8Array). */
export type Language = 'id' | 'en';
export type LanguageMode = Language | 'mixed';
export const LANGUAGES: readonly Language[] = ['id', 'en'] as const;

export const LANG_INDEX: Record<Language, 0 | 1> = { id: 0, en: 1 };
export const LANG_BY_INDEX: readonly Language[] = LANGUAGES;

export const LANGUAGE_LABEL: Record<Language, string> = {
  id: 'Indonesia',
  en: 'English',
};

/**
 * Kategori kata.
 *  d = kamus, p = populer/tidak baku, s = singkatan, n = nama tempat, c = kata khusus pengguna.
 */
export type KindCode = 'd' | 'p' | 's' | 'n' | 'c';
export const KIND_CODES: readonly KindCode[] = ['d', 'p', 's', 'n', 'c'] as const;
export const KIND_INDEX: Record<KindCode, number> = { d: 0, p: 1, s: 2, n: 3, c: 4 };

export const KIND_LABEL: Record<KindCode, string> = {
  d: 'Kamus',
  p: 'Populer / tidak baku',
  s: 'Singkatan',
  n: 'Nama tempat',
  c: 'Kata khusus',
};

/** Tingkat kosakata: 1 = umum, 2 = lazim, 3 = jarang/luas. */
export type Tier = 1 | 2 | 3;

export const TIER_LABEL: Record<Tier, string> = {
  1: 'Dasar',
  2: 'Umum',
  3: 'Luas',
};

/** Aturan sambungan: berapa huruf yang harus disambungkan. */
export interface RuleConfig {
  /** auto: panjang awalan mengikuti input. fixed: selalu N huruf terakhir. */
  mode: 'auto' | 'fixed';
  fixedLength: number;
}

/** Referensi kata terpakai yang dikirim ke mesin. */
export interface UsedRef {
  key: string;
  lang: Language;
}

/** Catatan kata yang sudah digunakan (disimpan di riwayat). */
export interface UsedWord {
  id: string;
  /** Bentuk ternormalisasi (huruf a-z saja) untuk pencocokan. */
  key: string;
  /** Ejaan asli dari dataset atau input pengguna. */
  word: string;
  lang: Language;
  /** Waktu pencatatan (ms epoch). */
  at: number;
  via: 'voice' | 'manual' | 'button';
  /** false bila kata tidak ditemukan di dataset dan dicatat sebagai kata khusus. */
  inDataset: boolean;
}

/** Kata khusus buatan pengguna. */
export interface CustomWord {
  /** Ejaan asli. */
  word: string;
  lang: Language;
  addedAt: number;
}

export interface LookupMatch {
  word: string;
  key: string;
  lang: Language;
  kind: KindCode;
  tier: Tier;
}
