import type { SearchResult } from './engine';
import { foldKey, tailOf } from './normalize';
import { DIFFICULTY_LABEL, difficultyOf, explain, type Difficulty } from './strategy';
import { KIND_CODES, LANG_BY_INDEX, type KindCode, type Language, type Tier } from './types';
import type { ViewMode } from './settings';

/** Logika penyajian hasil (tabel, urutan, saringan) yang murni agar dapat diuji tanpa UI. */

export type SortColumn = 'default' | 'word' | 'lang' | 'ending' | 'continuation' | 'score' | 'length';
export type SortDir = 'asc' | 'desc';

export interface TableSpec {
  id: 'all' | Language;
  title: string;
  /** Indeks baris pada SearchResult, dalam urutan default. */
  rows: number[];
}

export interface RowView {
  index: number;
  word: string;
  lang: Language;
  kind: KindCode;
  tier: Tier;
  used: boolean;
  continuation: number | null;
  score: number | null;
  difficulty: Difficulty | null;
  recommended: boolean;
  length: number;
}

const TITLE: Record<Language, string> = { id: 'Kosakata Indonesia', en: 'Kosakata Inggris' };

/**
 * Opsi A (single): satu tabel. Opsi B (split): tabel terpisah per bahasa.
 * Bila hanya satu bahasa aktif, selalu satu tabel dan tidak ada panel kosong.
 * Pengaturan ini hanya mengubah penyajian, bukan hasil algoritma.
 */
export function buildTables(result: SearchResult, view: ViewMode, languages: Language[]): TableSpec[] {
  const all = Array.from(result.order);
  if (view === 'split' && languages.length > 1) {
    return [
      { id: 'id', title: TITLE.id, rows: all.filter((r) => result.langs[r] === 0) },
      { id: 'en', title: TITLE.en, rows: all.filter((r) => result.langs[r] === 1) },
    ];
  }
  const only = languages.length === 1 ? languages[0]! : null;
  return [{ id: 'all', title: only ? TITLE[only] : 'Semua kata', rows: all }];
}

export function filterRows(result: SearchResult, rows: number[], query: string): number[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => result.words[r]!.toLowerCase().includes(q));
}

export function rowView(result: SearchResult, r: number): RowView {
  const word = result.words[r]!;
  const cont = result.cont[r]!;
  const score = result.scores[r]!;
  return {
    index: r,
    word,
    lang: LANG_BY_INDEX[result.langs[r]!]!,
    kind: KIND_CODES[result.kinds[r]!]!,
    tier: result.tiers[r] as Tier,
    used: result.used[r] === 1,
    continuation: cont >= 0 ? cont : null,
    score: Number.isNaN(score) ? null : score,
    difficulty: cont >= 0 ? difficultyOf(cont) : null,
    recommended: result.top.includes(r),
    length: foldKey(word).length,
  };
}

export function difficultyText(d: Difficulty | null): string {
  return d ? DIFFICULTY_LABEL[d] : '';
}

export function explainRow(result: SearchResult, r: number): string[] {
  const v = rowView(result, r);
  return explain({
    continuation: v.continuation,
    tier: v.tier,
    kind: v.kind,
    length: v.length,
    tail: tailOf(foldKey(v.word), result.tailLength),
  });
}

/** Mengurutkan baris menurut kolom. Nilai kosong (belum dihitung) selalu di akhir. */
export function sortRows(
  result: SearchResult,
  rows: number[],
  column: SortColumn,
  dir: SortDir,
): number[] {
  if (column === 'default') return rows;
  const sign = dir === 'asc' ? 1 : -1;
  const tailLen = result.tailLength;
  const numeric = (get: (r: number) => number | null) => (a: number, b: number) => {
    const x = get(a);
    const y = get(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (x - y) * sign;
  };
  const text = (get: (r: number) => string) => (a: number, b: number) => {
    const x = get(a);
    const y = get(b);
    return (x < y ? -1 : x > y ? 1 : 0) * sign;
  };
  let cmp: (a: number, b: number) => number;
  switch (column) {
    case 'word':
      cmp = text((r) => foldKey(result.words[r]!));
      break;
    case 'lang':
      cmp = (a, b) => (result.langs[a]! - result.langs[b]!) * sign;
      break;
    case 'ending':
      cmp = text((r) => tailOf(foldKey(result.words[r]!), tailLen));
      break;
    case 'continuation':
      cmp = numeric((r) => (result.cont[r]! >= 0 ? result.cont[r]! : null));
      break;
    case 'score':
      cmp = numeric((r) => (Number.isNaN(result.scores[r]!) ? null : result.scores[r]!));
      break;
    default:
      cmp = numeric((r) => foldKey(result.words[r]!).length);
  }
  // Array.prototype.sort stabil: urutan default menjadi pemutus seri.
  return [...rows].sort(cmp);
}
