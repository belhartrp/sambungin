import {
  EngineCore,
  type BrowseQuery,
  type BrowseResult,
  type DatasetStats,
  type EngineConfig,
  type LoadStats,
  type SearchQuery,
  type SearchResult,
} from './engine';
import type { CustomWord, Language, LookupMatch } from './types';

/**
 * Protokol antara UI dan mesin. EngineHost dipakai oleh Web Worker (jalur utama) dan oleh
 * transport inline (cadangan bila Worker tidak tersedia), sehingga logikanya sama persis.
 */

export type EngineRequest =
  | { type: 'init'; baseUrl: string; version: string; expectedBytes?: number }
  | { type: 'configure'; config: EngineConfig }
  | { type: 'setCustom'; words: CustomWord[] }
  | { type: 'search'; query: SearchQuery }
  | { type: 'lookup'; keys: string[]; languages: Language[] }
  | { type: 'browse'; query: BrowseQuery }
  | { type: 'stats' };

export interface EngineResponseMap {
  init: LoadStats;
  configure: { ms: number };
  setCustom: { inserted: number; skippedDuplicates: number };
  search: SearchResult;
  lookup: LookupMatch[][];
  browse: BrowseResult;
  stats: DatasetStats;
}

export type EngineRequestType = EngineRequest['type'];

export type WorkerMessage =
  | { kind: 'response'; id: number; ok: true; payload: unknown }
  | { kind: 'response'; id: number; ok: false; error: string }
  | { kind: 'progress'; fraction: number; stage: 'download' | 'parse' };

export type ProgressFn = (fraction: number, stage: 'download' | 'parse') => void;
export type FetchText = (
  url: string,
  onBytes: (loaded: number) => void,
) => Promise<string>;

/** Mengunduh teks dengan pelaporan jumlah byte yang sudah diterima. */
export const fetchTextStreaming: FetchText = async (url, onBytes) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal mengunduh ${url} (HTTP ${res.status})`);
  if (!res.body) {
    const text = await res.text();
    onBytes(text.length);
    return text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.byteLength;
    text += decoder.decode(value, { stream: true });
    onBytes(loaded);
  }
  return text + decoder.decode();
};

function transferablesOf(result: SearchResult): ArrayBuffer[] {
  return [result.langs, result.kinds, result.tiers, result.used, result.cont, result.scores, result.order].map(
    (a) => a.buffer as ArrayBuffer,
  );
}

export class EngineHost {
  readonly engine = new EngineCore();

  constructor(private readonly fetchText: FetchText = fetchTextStreaming) {}

  async handle(
    req: EngineRequest,
    onProgress: ProgressFn = () => {},
  ): Promise<{ payload: EngineResponseMap[EngineRequestType]; transfer: ArrayBuffer[] }> {
    switch (req.type) {
      case 'init': {
        const expected = req.expectedBytes ?? 1;
        const loaded = { id: 0, en: 0 };
        const report = () => onProgress(Math.min(0.95, (loaded.id + loaded.en) / expected), 'download');
        const q = `?v=${encodeURIComponent(req.version)}`;
        const [id, en] = await Promise.all([
          this.fetchText(`${req.baseUrl}/id.txt${q}`, (b) => ((loaded.id = b), report())),
          this.fetchText(`${req.baseUrl}/en.txt${q}`, (b) => ((loaded.en = b), report())),
        ]);
        onProgress(0.97, 'parse');
        const stats = this.engine.load({ id, en });
        onProgress(1, 'parse');
        return { payload: stats, transfer: [] };
      }
      case 'configure': {
        const t0 = Date.now();
        this.engine.configure(req.config);
        return { payload: { ms: Date.now() - t0 }, transfer: [] };
      }
      case 'setCustom':
        return { payload: this.engine.setCustomWords(req.words), transfer: [] };
      case 'search': {
        const result = this.engine.search(req.query);
        return { payload: result, transfer: transferablesOf(result) };
      }
      case 'lookup':
        return { payload: this.engine.lookup(req.keys, req.languages), transfer: [] };
      case 'browse':
        return { payload: this.engine.browse(req.query), transfer: [] };
      case 'stats':
        return { payload: this.engine.stats(), transfer: [] };
    }
  }
}
