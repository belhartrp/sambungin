import { foldKey } from './normalize';
import { KIND_CODES, KIND_INDEX, type KindCode } from './types';

/**
 * Leksikon kolumnar.
 *
 * Setiap entri adalah pasangan (kunci, bahasa), diurutkan menurut kunci lalu bahasa. Dengan
 * array terurut, semua kata berawalan P berada pada rentang kontigu [lowerBound(P),
 * lowerBound(P + "{")), sehingga pencarian awalan dan penghitungan jumlah kelanjutan cukup
 * memakai dua pencarian biner, tanpa memindai dataset. Karakter "{" (0x7B) berada tepat
 * setelah "z" (0x7A), jadi P + "{" adalah batas atas untuk semua kunci a-z berawalan P.
 */

/** Daftar satu bahasa yang sudah terurut menurut kunci. */
export interface LangList {
  lang: 0 | 1;
  keys: string[];
  words: string[];
  kind: Uint8Array;
  tier: Uint8Array;
  src: Uint8Array;
}

/**
 * Mengurai teks dataset. Format baris: "<tampilan>|<kategori><tingkat><sumber-hex>",
 * misalnya "abadi|d13". Baris rusak dilewati dan dihitung.
 */
export function parseLangList(lang: 0 | 1, text: string): { list: LangList; skipped: number } {
  const lines = text.split('\n');
  const n = lines.length;
  const keys: string[] = [];
  const words: string[] = [];
  const kind = new Uint8Array(n);
  const tier = new Uint8Array(n);
  const src = new Uint8Array(n);
  let count = 0;
  let skipped = 0;

  for (let i = 0; i < n; i++) {
    const line = lines[i];
    if (!line) continue;
    const bar = line.lastIndexOf('|');
    if (bar <= 0 || line.length - bar < 4) {
      skipped++;
      continue;
    }
    const kindIdx = KIND_INDEX[line[bar + 1] as KindCode];
    const t = line.charCodeAt(bar + 2) - 48;
    const s = parseInt(line.slice(bar + 3), 16);
    const word = line.slice(0, bar);
    const key = foldKey(word);
    if (kindIdx === undefined || t < 1 || t > 3 || Number.isNaN(s) || !key) {
      skipped++;
      continue;
    }
    keys.push(key);
    words.push(word);
    kind[count] = kindIdx;
    tier[count] = t;
    src[count] = s;
    count++;
  }

  return {
    list: {
      lang,
      keys,
      words,
      kind: kind.subarray(0, count),
      tier: tier.subarray(0, count),
      src: src.subarray(0, count),
    },
    skipped,
  };
}

/** Membuat LangList dari kata mentah (urutkan menurut kunci). Dipakai untuk kata khusus. */
export function buildLangList(
  lang: 0 | 1,
  items: { word: string; kind: KindCode; tier: 1 | 2 | 3 }[],
): LangList {
  const rows = items
    .map((it) => ({ ...it, key: foldKey(it.word) }))
    .filter((r) => r.key.length > 0)
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const kind = new Uint8Array(rows.length);
  const tier = new Uint8Array(rows.length);
  const src = new Uint8Array(rows.length);
  rows.forEach((r, i) => {
    kind[i] = KIND_INDEX[r.kind];
    tier[i] = r.tier;
    src[i] = 0;
  });
  return { lang, keys: rows.map((r) => r.key), words: rows.map((r) => r.word), kind, tier, src };
}

export class Lexicon {
  readonly length: number;
  readonly keys: string[];
  readonly words: string[];
  readonly lang: Uint8Array;
  readonly kind: Uint8Array;
  readonly tier: Uint8Array;
  readonly src: Uint8Array;

  private constructor(
    keys: string[],
    words: string[],
    lang: Uint8Array,
    kind: Uint8Array,
    tier: Uint8Array,
    src: Uint8Array,
  ) {
    this.length = keys.length;
    this.keys = keys;
    this.words = words;
    this.lang = lang;
    this.kind = kind;
    this.tier = tier;
    this.src = src;
  }

  /**
   * Penggabungan k-arah linear, O(n). Pasangan (kunci, bahasa) yang sama muncul sekali saja:
   * daftar yang lebih awal pada argumen menang (daftar bawaan sebelum kata khusus), sehingga
   * duplikasi data tidak pernah membuat satu kata terhitung dua kali.
   */
  static merge(lists: LangList[]): Lexicon {
    const total = lists.reduce((s, l) => s + l.keys.length, 0);
    const keys: string[] = new Array<string>(total);
    const words: string[] = new Array<string>(total);
    const lang = new Uint8Array(total);
    const kind = new Uint8Array(total);
    const tier = new Uint8Array(total);
    const src = new Uint8Array(total);
    const head = lists.map(() => 0);
    let n = 0;

    for (;;) {
      let best = -1;
      for (let j = 0; j < lists.length; j++) {
        const list = lists[j]!;
        const h = head[j]!;
        if (h >= list.keys.length) continue;
        if (best === -1) {
          best = j;
          continue;
        }
        const bl = lists[best]!;
        const bk = bl.keys[head[best]!]!;
        const k = list.keys[h]!;
        if (k < bk || (k === bk && list.lang < bl.lang)) best = j;
      }
      if (best === -1) break;
      const list = lists[best]!;
      const h = head[best]!;
      head[best] = h + 1;
      const key = list.keys[h]!;
      if (n > 0 && keys[n - 1] === key && lang[n - 1] === list.lang) continue; // duplikat
      keys[n] = key;
      words[n] = list.words[h]!;
      lang[n] = list.lang;
      kind[n] = list.kind[h]!;
      tier[n] = list.tier[h]!;
      src[n] = list.src[h]!;
      n++;
    }

    keys.length = n;
    words.length = n;
    return new Lexicon(
      keys,
      words,
      lang.subarray(0, n),
      kind.subarray(0, n),
      tier.subarray(0, n),
      src.subarray(0, n),
    );
  }

  /** Indeks pertama dengan kunci >= key. */
  lowerBound(key: string): number {
    let lo = 0;
    let hi = this.length;
    const keys = this.keys;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (keys[mid]! < key) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Rentang [lo, hi) semua entri yang kuncinya berawalan prefix. */
  prefixRange(prefix: string): [number, number] {
    if (!prefix) return [0, this.length];
    return [this.lowerBound(prefix), this.lowerBound(prefix + '{')];
  }

  /** Rentang [lo, hi) entri dengan kunci persis sama (maksimal satu per bahasa). */
  exactRange(key: string): [number, number] {
    const lo = this.lowerBound(key);
    let hi = lo;
    while (hi < this.length && this.keys[hi] === key) hi++;
    return [lo, hi];
  }

  kindCode(i: number): KindCode {
    return KIND_CODES[this.kind[i]!]!;
  }
}
