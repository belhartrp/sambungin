import { foldKey } from './normalize';
import type { Language, UsedRef, UsedWord } from './types';

/**
 * Operasi riwayat kata terpakai. Semua fungsi murni (mengembalikan daftar baru) sehingga mudah
 * diuji dan aman dipakai di store React. Daftar selalu kronologis: elemen terakhir adalah
 * penandaan terbaru.
 */

export interface AddInput {
  word: string;
  lang: Language;
  via: UsedWord['via'];
  inDataset: boolean;
  now?: number;
  id?: string;
}

export interface AddResult {
  list: UsedWord[];
  added: UsedWord | null;
  /** Catatan yang sudah ada dan menyebabkan penambahan ditolak. */
  duplicate: UsedWord | null;
}

let counter = 0;
export function newId(now: number = Date.now()): string {
  counter = (counter + 1) % 1_000_000;
  return `${now.toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Mencari catatan yang sama menurut kebijakan: lintas bahasa (kunci sama) atau per bahasa. */
export function findUsed(
  list: UsedWord[],
  key: string,
  lang: Language,
  acrossLanguages: boolean,
): UsedWord | null {
  for (const u of list) {
    if (u.key === key && (acrossLanguages || u.lang === lang)) return u;
  }
  return null;
}

export function addUsed(list: UsedWord[], input: AddInput, acrossLanguages: boolean): AddResult {
  const key = foldKey(input.word);
  if (!key) return { list, added: null, duplicate: null };
  const dup = findUsed(list, key, input.lang, acrossLanguages);
  if (dup) return { list, added: null, duplicate: dup };
  const now = input.now ?? Date.now();
  const added: UsedWord = {
    id: input.id ?? newId(now),
    key,
    word: input.word,
    lang: input.lang,
    at: now,
    via: input.via,
    inDataset: input.inDataset,
  };
  return { list: [...list, added], added, duplicate: null };
}

/** Membatalkan penandaan terakhir. */
export function undoLast(list: UsedWord[]): { list: UsedWord[]; removed: UsedWord | null } {
  if (list.length === 0) return { list, removed: null };
  return { list: list.slice(0, -1), removed: list[list.length - 1]! };
}

export function removeUsed(list: UsedWord[], id: string): { list: UsedWord[]; removed: UsedWord | null } {
  const removed = list.find((u) => u.id === id) ?? null;
  if (!removed) return { list, removed: null };
  return { list: list.filter((u) => u.id !== id), removed };
}

export function toRefs(list: UsedWord[]): UsedRef[] {
  return list.map((u) => ({ key: u.key, lang: u.lang }));
}

/** Memvalidasi data riwayat hasil baca dari penyimpanan. Entri rusak dibuang. */
export function sanitizeUsedList(raw: unknown): UsedWord[] {
  if (!Array.isArray(raw)) return [];
  const out: UsedWord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (
      typeof r.id !== 'string' ||
      typeof r.word !== 'string' ||
      (r.lang !== 'id' && r.lang !== 'en') ||
      typeof r.at !== 'number'
    ) {
      continue;
    }
    const key = foldKey(r.word);
    if (!key) continue;
    out.push({
      id: r.id,
      key,
      word: r.word,
      lang: r.lang,
      at: r.at,
      via: r.via === 'voice' || r.via === 'button' ? r.via : 'manual',
      inDataset: r.inDataset !== false,
    });
  }
  return out.sort((a, b) => a.at - b.at);
}
