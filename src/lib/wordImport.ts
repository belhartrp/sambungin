import { validateWord } from './normalize';
import type { Language } from './types';

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_WORDS = 100_000;

export interface ImportedWord {
  word: string;
  lang: Language;
}

export interface InvalidLine {
  line: number;
  value: string;
  reason: string;
}

export interface ImportReport {
  valid: ImportedWord[];
  /** Duplikat di dalam file itu sendiri (kunci dan bahasa sama). */
  duplicatesInFile: number;
  /** Contoh baris tidak valid (maksimal 200). */
  invalid: InvalidLine[];
  /** Jumlah seluruh entri tidak valid. */
  invalidCount: number;
  /** true bila jumlah kata melebihi batas dan sisanya diabaikan. */
  truncated: boolean;
}

const LANG_ALIASES: Record<string, Language> = {
  id: 'id',
  ind: 'id',
  indonesia: 'id',
  indonesian: 'id',
  'bahasa indonesia': 'id',
  en: 'en',
  eng: 'en',
  english: 'en',
  inggris: 'en',
  'bahasa inggris': 'en',
};

const HEADER_WORDS = new Set(['word', 'words', 'kata']);

const parseLang = (s: string): Language | null => LANG_ALIASES[s.trim().toLowerCase()] ?? null;

/** Memeriksa metadata file sebelum dibaca. Mengembalikan pesan galat atau null bila layak. */
export function checkFileMeta(file: { name: string; size: number }): string | null {
  if (file.size === 0) return 'File kosong.';
  if (file.size > MAX_IMPORT_BYTES) {
    return `File terlalu besar (maksimal ${MAX_IMPORT_BYTES / 1024 / 1024} MB).`;
  }
  if (!/\.(txt|csv|tsv|text)$/i.test(file.name)) {
    return 'Format tidak didukung. Gunakan file .txt, .csv, atau .tsv.';
  }
  return null;
}

/**
 * Mengurai teks impor.
 *
 * Format yang diterima, satu entri per baris:
 *   kata
 *   kata,bahasa      (bahasa: id, en, indonesia, english, inggris)
 *   kata1,kata2,...  (beberapa kata pada satu baris, memakai bahasa bawaan)
 * Baris berawalan "#" diabaikan. Baris judul seperti "word,language" dilewati.
 */
export function parseWordFile(text: string, defaultLang: Language): ImportReport {
  const report: ImportReport = { valid: [], duplicatesInFile: 0, invalid: [], invalidCount: 0, truncated: false };
  const seen = new Set<string>();
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!.trim();
    if (!raw || raw.startsWith('#')) continue;

    const parts = raw
      .split(/[,;\t]/)
      .map((p) => p.trim().replace(/^["']|["']$/g, ''))
      .filter((p) => p.length > 0);
    if (parts.length === 0) continue;

    if (i === 0 || report.valid.length === 0) {
      if (HEADER_WORDS.has(parts[0]!.toLowerCase())) continue;
    }

    const explicit = parts.length === 2 ? parseLang(parts[1]!) : null;
    const entries: Array<{ value: string; lang: Language }> =
      explicit !== null
        ? [{ value: parts[0]!, lang: explicit }]
        : parts.map((p) => ({ value: p, lang: defaultLang }));

    for (const e of entries) {
      const v = validateWord(e.value);
      if (!v.ok) {
        report.invalidCount++;
        if (report.invalid.length < 200) {
          report.invalid.push({ line: i + 1, value: e.value.slice(0, 60), reason: v.reason });
        }
        continue;
      }
      const dedupeKey = `${e.lang}:${v.key}`;
      if (seen.has(dedupeKey)) {
        report.duplicatesInFile++;
        continue;
      }
      if (report.valid.length >= MAX_IMPORT_WORDS) {
        report.truncated = true;
        return report;
      }
      seen.add(dedupeKey);
      report.valid.push({ word: v.word, lang: e.lang });
    }
  }
  return report;
}
