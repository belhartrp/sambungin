import { Lexicon, buildLangList, parseLangList, type LangList } from './lexicon';
import { foldKey, tailOf } from './normalize';
import {
  isScoring,
  needsContinuation,
  scoreCandidate,
  type StrategyOptions,
} from './strategy';
import {
  KIND_CODES,
  LANG_BY_INDEX,
  LANG_INDEX,
  type CustomWord,
  type KindCode,
  type Language,
  type LookupMatch,
  type Tier,
  type UsedRef,
} from './types';

/** Konfigurasi yang menentukan kata mana yang dianggap valid dan tersedia. */
export interface EngineConfig {
  /** Bahasa aktif. Mode campuran = ['id', 'en']. */
  languages: Language[];
  /** Tingkat tertinggi kata yang boleh muncul sebagai kandidat. */
  searchTier: Tier;
  /** Tingkat tertinggi kata yang dihitung sebagai pilihan lanjutan lawan. */
  opponentTier: Tier;
  includeInformal: boolean;
  includeNames: boolean;
  excludeUsed: boolean;
  /** true: kata terpakai berlaku lintas bahasa (kunci sama = sudah dipakai). */
  usedAcrossLanguages: boolean;
  used: UsedRef[];
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  languages: ['id', 'en'],
  searchTier: 3,
  opponentTier: 2,
  includeInformal: true,
  includeNames: true,
  excludeUsed: true,
  usedAcrossLanguages: true,
  used: [],
};

export interface SearchQuery {
  /** Awalan ternormalisasi (a-z). Kosong menghasilkan hasil kosong. */
  prefix: string;
  tailLength: number;
  strategy: StrategyOptions;
  /** Jumlah rekomendasi teratas. */
  topN?: number;
}

/** Hasil pencarian dalam bentuk kolom agar murah dikirim dari worker ke UI. */
export interface SearchResult {
  prefix: string;
  tailLength: number;
  /** Kata yang cocok awalan dan cakupan (belum memperhitungkan kata terpakai). */
  matched: number;
  /** Dari matched, berapa yang sudah tercatat terpakai. */
  usedMatched: number;
  /** matched dikurangi usedMatched. */
  available: number;
  rowCount: number;
  words: string[];
  langs: Uint8Array;
  kinds: Uint8Array;
  tiers: Uint8Array;
  used: Uint8Array;
  /** Jumlah kelanjutan; -1 bila tidak dihitung. */
  cont: Int32Array;
  /** Skor strategi; NaN bila tidak dihitung. */
  scores: Float32Array;
  /** Urutan baris default (skor menurun bila ada skor, jika tidak alfabetis). */
  order: Int32Array;
  /** Indeks baris rekomendasi teratas, sudah berurutan. */
  top: number[];
  counted: boolean;
  scored: boolean;
  langCounts: { id: number; en: number };
  tookMs: number;
}

export interface LoadStats {
  id: number;
  en: number;
  skipped: number;
  total: number;
}

export interface BrowseQuery {
  lang: Language | 'all';
  query: string;
  mode: 'prefix' | 'contains';
  limit: number;
  customOnly?: boolean;
}

export interface BrowseRow {
  word: string;
  lang: Language;
  kind: KindCode;
  tier: Tier;
  src: number;
}

export interface BrowseResult {
  rows: BrowseRow[];
  /** Jumlah total yang cocok (dibatasi 50.000 untuk mode contains). */
  total: number;
  capped: boolean;
}

export interface DatasetStats {
  total: number;
  byLang: Record<Language, { total: number; byKind: Record<KindCode, number>; byTier: Record<Tier, number> }>;
  custom: number;
}

const emptyKindCounts = (): Record<KindCode, number> => ({ d: 0, p: 0, s: 0, n: 0, c: 0 });
const emptyTierCounts = (): Record<Tier, number> => ({ 1: 0, 2: 0, 3: 0 });

const KIND_RANK_FOR_SORT = [0, 1, 1, 2, 0];

export class EngineCore {
  private baseId: LangList | null = null;
  private baseEn: LangList | null = null;
  private customLists: LangList[] = [];
  private lex: Lexicon | null = null;
  private cfg: EngineConfig = DEFAULT_ENGINE_CONFIG;

  // Hasil configure().
  private candElig = new Uint8Array(0);
  private usedMask = new Uint8Array(0);
  private oppFinal = new Uint8Array(0);
  /** cum[i] = jumlah kunci unik yang dikenal lawan pada entri [0, i). */
  private cum = new Uint32Array(1);

  get ready(): boolean {
    return this.lex !== null;
  }

  get lexicon(): Lexicon {
    if (!this.lex) throw new Error('Dataset belum dimuat');
    return this.lex;
  }

  get config(): EngineConfig {
    return this.cfg;
  }

  /** Memuat teks dataset kedua bahasa. */
  load(texts: { id: string; en: string }): LoadStats {
    const id = parseLangList(0, texts.id);
    const en = parseLangList(1, texts.en);
    this.baseId = id.list;
    this.baseEn = en.list;
    this.rebuild();
    return {
      id: id.list.keys.length,
      en: en.list.keys.length,
      skipped: id.skipped + en.skipped,
      total: this.lex?.length ?? 0,
    };
  }

  /**
   * Mengganti seluruh kata khusus. Kata yang sudah ada di dataset bawaan untuk bahasa yang sama
   * dilewati (dihitung di skippedDuplicates), jadi tidak ada kata yang terhitung dua kali.
   */
  setCustomWords(words: CustomWord[]): { inserted: number; skippedDuplicates: number } {
    const byLang: [Array<{ word: string; kind: KindCode; tier: Tier }>, Array<{ word: string; kind: KindCode; tier: Tier }>] = [[], []];
    for (const w of words) {
      byLang[LANG_INDEX[w.lang]].push({ word: w.word, kind: 'c', tier: 1 });
    }
    this.customLists = [buildLangList(0, byLang[0]), buildLangList(1, byLang[1])];
    this.rebuild();
    const baseCount = (this.baseId?.keys.length ?? 0) + (this.baseEn?.keys.length ?? 0);
    const inserted = (this.lex?.length ?? 0) - baseCount;
    const uniqueCustom = this.customLists.reduce((s, l) => s + l.keys.length, 0);
    return { inserted, skippedDuplicates: uniqueCustom - inserted };
  }

  private rebuild(): void {
    if (!this.baseId || !this.baseEn) return;
    this.lex = Lexicon.merge([this.baseId, this.baseEn, ...this.customLists]);
    this.configure(this.cfg);
  }

  /**
   * Menghitung ulang eligibilitas dan jumlah kelanjutan. Dipanggil saat bahasa, cakupan,
   * kategori, atau daftar kata terpakai berubah. Kompleksitas O(n) dengan n jumlah entri,
   * sekitar beberapa milidetik untuk 340 ribu entri.
   */
  configure(config: EngineConfig): void {
    this.cfg = config;
    const lex = this.lex;
    if (!lex) return;
    const n = lex.length;
    const langOn: boolean[] = [config.languages.includes('id'), config.languages.includes('en')];
    // Urutan kategori: d, p, s, n, c
    const kindOk = [true, config.includeInformal, config.includeInformal, config.includeNames, true];

    const candElig = new Uint8Array(n);
    const oppBase = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (!langOn[lex.lang[i]!] || !kindOk[lex.kind[i]!]) continue;
      const t = lex.tier[i]!;
      if (t <= config.searchTier) candElig[i] = 1;
      if (t <= config.opponentTier) oppBase[i] = 1;
    }

    const usedMask = new Uint8Array(n);
    for (const ref of config.used) {
      const [lo, hi] = lex.exactRange(ref.key);
      for (let i = lo; i < hi; i++) {
        if (config.usedAcrossLanguages || lex.lang[i] === LANG_INDEX[ref.lang]) usedMask[i] = 1;
      }
    }

    const oppFinal = new Uint8Array(n);
    const cum = new Uint32Array(n + 1);
    const keys = lex.keys;
    for (let i = 0; i < n; i++) {
      const on = oppBase[i]! === 1 && !(config.excludeUsed && usedMask[i] === 1);
      oppFinal[i] = on ? 1 : 0;
      // Kunci yang sama pada dua bahasa (mis. "hotel") dihitung sekali sebagai pilihan lanjutan.
      const duplicateOfPrev = i > 0 && keys[i - 1] === keys[i] && oppFinal[i - 1] === 1;
      cum[i + 1] = cum[i]! + (on && !duplicateOfPrev ? 1 : 0);
    }

    this.candElig = candElig;
    this.usedMask = usedMask;
    this.oppFinal = oppFinal;
    this.cum = cum;
  }

  /** Jumlah kunci unik yang dikenal lawan dan berawalan `tail`. */
  continuationCount(tail: string): number {
    const lex = this.lexicon;
    if (!tail) return 0;
    const lo = lex.lowerBound(tail);
    const hi = lex.lowerBound(tail + '{');
    return this.cum[hi]! - this.cum[lo]!;
  }

  /** Apakah kunci entri i termasuk yang dikenal lawan (pada bahasa mana pun). */
  private keyKnownToOpponent(i: number): boolean {
    const lex = this.lexicon;
    if (this.oppFinal[i] === 1) return true;
    if (i > 0 && lex.keys[i - 1] === lex.keys[i] && this.oppFinal[i - 1] === 1) return true;
    if (i + 1 < lex.length && lex.keys[i + 1] === lex.keys[i] && this.oppFinal[i + 1] === 1) return true;
    return false;
  }

  search(q: SearchQuery): SearchResult {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const lex = this.lexicon;
    const cfg = this.cfg;
    const strategy = q.strategy;
    const wantCont = needsContinuation(strategy);
    const wantScore = isScoring(strategy);

    const idx: number[] = [];
    let matched = 0;
    let usedMatched = 0;
    const langCounts = { id: 0, en: 0 };

    if (q.prefix) {
      const [lo, hi] = lex.prefixRange(q.prefix);
      for (let i = lo; i < hi; i++) {
        if (this.candElig[i] !== 1) continue;
        matched++;
        const isUsed = this.usedMask[i] === 1;
        if (isUsed) {
          usedMatched++;
          if (cfg.excludeUsed) continue;
        }
        langCounts[LANG_BY_INDEX[lex.lang[i]!]!]++;
        idx.push(i);
      }
    }

    const m = idx.length;
    const words = new Array<string>(m);
    const langs = new Uint8Array(m);
    const kinds = new Uint8Array(m);
    const tiers = new Uint8Array(m);
    const used = new Uint8Array(m);
    const cont = new Int32Array(m).fill(-1);
    const scores = new Float32Array(m).fill(Number.NaN);

    const memo = new Map<string, number>();
    for (let r = 0; r < m; r++) {
      const i = idx[r]!;
      words[r] = lex.words[i]!;
      langs[r] = lex.lang[i]!;
      kinds[r] = lex.kind[i]!;
      tiers[r] = lex.tier[i]!;
      used[r] = this.usedMask[i]!;

      let c: number | null = null;
      if (wantCont) {
        const key = lex.keys[i]!;
        const tail = tailOf(key, q.tailLength);
        let base = memo.get(tail);
        if (base === undefined) {
          base = this.continuationCount(tail);
          memo.set(tail, base);
        }
        // Kandidat menjadi terpakai begitu dimainkan, jadi tidak boleh dihitung sebagai
        // pilihan lanjutan lawan (berlaku bila kata yang sama berawalan dengan akhirannya).
        const self = cfg.excludeUsed && key.startsWith(tail) && this.keyKnownToOpponent(i) ? 1 : 0;
        c = Math.max(0, base - self);
        cont[r] = c;
      }
      if (wantScore) {
        const s = scoreCandidate(
          {
            continuation: c,
            tier: tiers[r]!,
            kind: KIND_CODES[kinds[r]!]!,
            length: lex.keys[i]!.length,
          },
          strategy,
        );
        if (s !== null) scores[r] = s;
      }
    }

    // Urutan default: skor menurun (lalu kelanjutan menaik, kata lebih umum, alfabet);
    // tanpa skor, urutan alfabetis sesuai indeks.
    const order = new Int32Array(m);
    for (let r = 0; r < m; r++) order[r] = r;
    const scored = wantScore && m > 0 && !Number.isNaN(scores[0]!);
    const preferLonger = strategy.considerLength && strategy.lengthPreference === 'longer';
    if (scored) {
      const sortable = Array.from(order);
      sortable.sort((a, b) => {
        const sa = scores[a]!;
        const sb = scores[b]!;
        if (sa !== sb) return sb - sa;
        const ca = cont[a]!;
        const cb = cont[b]!;
        if (ca !== cb) return ca - cb;
        if (tiers[a] !== tiers[b]) return tiers[a]! - tiers[b]!;
        const ka = KIND_RANK_FOR_SORT[kinds[a]!]!;
        const kb = KIND_RANK_FOR_SORT[kinds[b]!]!;
        if (ka !== kb) return ka - kb;
        // Skor seri: kata lebih pendek lebih mudah diingat dan kecil risiko salah eja, kecuali
        // pengguna meminta kata panjang. Tanpa ini, seri hanya terurut alfabetis dan tidak berguna.
        const la = lex.keys[idx[a]!]!.length;
        const lb = lex.keys[idx[b]!]!.length;
        if (la !== lb) return preferLonger ? lb - la : la - lb;
        return a - b;
      });
      order.set(sortable);
    }

    // Rekomendasi teratas: tidak memakai kata terpakai dan tidak mengulang kunci yang sama.
    const top: number[] = [];
    if (scored) {
      const seen = new Set<string>();
      const topN = q.topN ?? 5;
      for (let o = 0; o < m && top.length < topN; o++) {
        const r = order[o]!;
        if (used[r] === 1) continue;
        const key = lex.keys[idx[r]!]!;
        if (seen.has(key)) continue;
        seen.add(key);
        top.push(r);
      }
    }

    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return {
      prefix: q.prefix,
      tailLength: q.tailLength,
      matched,
      usedMatched,
      available: matched - usedMatched,
      rowCount: m,
      words,
      langs,
      kinds,
      tiers,
      used,
      cont,
      scores,
      order,
      top,
      counted: wantCont,
      scored,
      langCounts,
      tookMs: t1 - t0,
    };
  }

  /**
   * Mencari kata di dataset untuk penandaan. Tidak terpengaruh cakupan atau kategori:
   * kata apa pun dari dataset pada bahasa aktif dapat ditandai terpakai.
   */
  lookup(keys: string[], languages: Language[]): LookupMatch[][] {
    const lex = this.lexicon;
    const on = new Set(languages.map((l) => LANG_INDEX[l]));
    return keys.map((raw) => {
      const key = foldKey(raw);
      if (!key) return [];
      const [lo, hi] = lex.exactRange(key);
      const out: LookupMatch[] = [];
      for (let i = lo; i < hi; i++) {
        if (!on.has(lex.lang[i] as 0 | 1)) continue;
        out.push({
          word: lex.words[i]!,
          key,
          lang: LANG_BY_INDEX[lex.lang[i]!]!,
          kind: lex.kindCode(i),
          tier: lex.tier[i] as Tier,
        });
      }
      return out;
    });
  }

  /** Menjelajahi dataset untuk panel Dataset. */
  browse(q: BrowseQuery): BrowseResult {
    const lex = this.lexicon;
    const query = foldKey(q.query);
    const langFilter = q.lang === 'all' ? null : LANG_INDEX[q.lang];
    const rows: BrowseRow[] = [];
    let total = 0;
    let capped = false;
    const CAP = 50_000;

    const consider = (i: number): void => {
      if (langFilter !== null && lex.lang[i] !== langFilter) return;
      if (q.customOnly && lex.kind[i] !== 4) return;
      total++;
      if (rows.length < q.limit) {
        rows.push({
          word: lex.words[i]!,
          lang: LANG_BY_INDEX[lex.lang[i]!]!,
          kind: lex.kindCode(i),
          tier: lex.tier[i] as Tier,
          src: lex.src[i]!,
        });
      }
    };

    if (q.mode === 'prefix' || !query) {
      const [lo, hi] = lex.prefixRange(query);
      for (let i = lo; i < hi; i++) consider(i);
    } else {
      for (let i = 0; i < lex.length; i++) {
        if (lex.keys[i]!.includes(query)) {
          consider(i);
          if (total >= CAP) {
            capped = true;
            break;
          }
        }
      }
    }
    return { rows, total, capped };
  }

  stats(): DatasetStats {
    const lex = this.lexicon;
    const mk = () => ({ total: 0, byKind: emptyKindCounts(), byTier: emptyTierCounts() });
    const byLang: DatasetStats['byLang'] = { id: mk(), en: mk() };
    let custom = 0;
    for (let i = 0; i < lex.length; i++) {
      const s = byLang[LANG_BY_INDEX[lex.lang[i]!]!];
      s.total++;
      s.byKind[lex.kindCode(i)]++;
      s.byTier[lex.tier[i] as Tier]++;
      if (lex.kind[i] === 4) custom++;
    }
    return { total: lex.length, byLang, custom };
  }
}
