import { create } from 'zustand';
import type { BrowseQuery, BrowseResult, DatasetStats, SearchResult } from '@/lib/engine';
import { EngineClient } from '@/lib/engineClient';
import { addUsed, removeUsed as removeUsedFromList, toRefs, undoLast } from '@/lib/history';
import { foldKey, tailOf, validateWord } from '@/lib/normalize';
import { resolveRule, type ResolvedRule } from '@/lib/rules';
import {
  DEFAULT_SETTINGS,
  engineConfigFrom,
  languagesOf,
  recognitionLanguage,
  sanitizeSettings,
  structuredCloneSettings,
  type Settings,
} from '@/lib/settings';
import {
  cleanMarkText,
  parseTranscript,
  resolveMark,
  type Alternative,
  type InputMode,
  type IntentContext,
} from '@/lib/speech/intent';
import {
  createCustomWordStore,
  createLocalHistoryStore,
  createSessionHistoryStore,
  loadSettings,
  saveSettings,
  type HistoryStore,
} from '@/lib/storage';
import type { ImportedWord } from '@/lib/wordImport';
import type { CustomWord, Language, LookupMatch, UsedWord } from '@/lib/types';

/* ------------------------------------------------------------------------ Tipe */

export interface SourceInfo {
  lang: Language;
  bit: number;
  name: string;
  license: string;
  url: string;
  usage: string;
}

export interface Manifest {
  version: string;
  languages: Record<Language, { count: number; bytes: number; byKind: Record<string, number>; byTier: Record<string, number> }>;
  sources: SourceInfo[];
}

export type DatasetStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface Toast {
  id: number;
  tone: 'info' | 'success' | 'error';
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export type PendingConfirm =
  | { type: 'choices'; heard: string; choices: LookupMatch[]; via: UsedWord['via'] }
  | { type: 'unknown'; heard: string; word: string; via: UsedWord['via'] };

export interface CustomActionResult {
  ok: boolean;
  message: string;
}

export interface ImportSummary {
  added: number;
  alreadyInDataset: number;
  alreadyCustom: number;
}

interface AppState {
  hydrated: boolean;
  settings: Settings;
  used: UsedWord[];
  custom: CustomWord[];

  dataset: { status: DatasetStatus; fraction: number; stage: 'download' | 'parse'; message: string | null; engineMode: 'worker' | 'inline' };
  manifest: Manifest | null;

  mode: InputMode;
  prefixText: string;
  markText: string;
  interim: string;
  lastHeard: string;

  rule: ResolvedRule;
  result: SearchResult | null;
  searching: boolean;
  searchError: string | null;

  pendingConfirm: PendingConfirm | null;
  toasts: Toast[];

  bootstrap: () => Promise<void>;
  patchSettings: (patch: Partial<Settings>) => void;
  patchStrategy: (patch: Partial<Settings['strategy']>) => void;
  patchRule: (patch: Partial<Settings['rule']>) => void;
  resetSettings: () => void;
  retryDataset: () => void;

  setMode: (mode: InputMode) => void;
  setInputText: (text: string) => void;
  clearInput: () => void;
  searchNow: () => Promise<void>;

  voiceInterim: (text: string) => void;
  voiceFinal: (alts: Alternative[]) => Promise<void>;

  markCurrentText: () => Promise<void>;
  markWordFromRow: (word: string, lang: Language) => void;
  confirmChoice: (match: LookupMatch) => void;
  confirmUnknown: (lang: Language) => void;
  dismissConfirm: () => void;
  searchFollowUp: (word: string) => void;

  undo: () => void;
  removeUsed: (id: string) => void;
  clearUsed: () => void;

  addCustomWord: (word: string, lang: Language) => Promise<CustomActionResult>;
  removeCustomWord: (word: string, lang: Language) => void;
  importCustomWords: (items: ImportedWord[]) => Promise<ImportSummary>;
  clearCustomWords: () => void;

  browseDataset: (q: BrowseQuery) => Promise<BrowseResult>;
  datasetStats: () => Promise<DatasetStats>;

  pushToast: (t: Omit<Toast, 'id'>, ttl?: number) => number;
  dismissToast: (id: number) => void;
}

/* ------------------------------------------------------------------ Util modul */

let engine: EngineClient | null = null;
const getEngine = (): EngineClient => (engine ??= new EngineClient());

const customStore = createCustomWordStore();
const historyStoreFor = (p: Settings['persistence']): HistoryStore =>
  p === 'local' ? createLocalHistoryStore() : createSessionHistoryStore();

let searchSeq = 0;
let toastSeq = 0;
let syncScheduled = false;
let typingTimer: ReturnType<typeof setTimeout> | undefined;
let interimTimer: ReturnType<typeof setTimeout> | undefined;
let bootstrapped = false;

const TYPING_DEBOUNCE_MS = 70;
const INTERIM_STABLE_MS = 450;

/** Bagian pengaturan yang memengaruhi mesin. Pengaturan tampilan tidak memicu sinkronisasi. */
function engineKey(s: Settings): string {
  return JSON.stringify([engineConfigFrom(s, []), s.strategy, s.rule]);
}

const intentContext = (s: Settings, mode: InputMode): IntentContext => ({
  mode,
  voiceCommands: s.voiceCommands,
  spelling: s.voiceSpelling,
});

/** Format 'a' -> teks untuk toast. */
const quote = (w: string): string => `“${w}”`;

/* ------------------------------------------------------------------------ Store */

export const useApp = create<AppState>()((set, get) => {
  const scheduleSync = (): void => {
    if (syncScheduled) return;
    syncScheduled = true;
    queueMicrotask(() => {
      syncScheduled = false;
      void syncEngine();
    });
  };

  async function syncEngine(): Promise<void> {
    const { dataset, settings, used } = get();
    if (dataset.status !== 'ready') return;
    try {
      await getEngine().request({ type: 'configure', config: engineConfigFrom(settings, toRefs(used)) });
      await get().searchNow();
    } catch (err) {
      set({ searchError: err instanceof Error ? err.message : 'Gagal menerapkan pengaturan.' });
    }
  }

  const persistHistory = (): void => {
    const { settings, used } = get();
    void historyStoreFor(settings.persistence).save(used);
  };

  const persistCustom = (): void => {
    void customStore.save(get().custom);
  };

  const startDataset = async (): Promise<void> => {
    set((st) => ({ dataset: { ...st.dataset, status: 'loading', fraction: 0, message: null } }));
    const client = getEngine();
    const off = client.onProgress((fraction, stage) =>
      set((st) => ({ dataset: { ...st.dataset, fraction, stage } })),
    );
    try {
      let manifest = get().manifest;
      if (!manifest) {
        const res = await fetch('/data/manifest.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error(`Manifest dataset tidak ditemukan (HTTP ${res.status}).`);
        manifest = (await res.json()) as Manifest;
        set({ manifest });
      }
      const expectedBytes = manifest.languages.id.bytes + manifest.languages.en.bytes;
      await client.request({ type: 'init', baseUrl: '/data', version: manifest.version, expectedBytes });
      const { custom } = get();
      if (custom.length > 0) await client.request({ type: 'setCustom', words: custom });
      set((st) => ({ dataset: { ...st.dataset, status: 'ready', fraction: 1, engineMode: client.mode } }));
      await syncEngine();
    } catch (err) {
      set((st) => ({
        dataset: {
          ...st.dataset,
          status: 'error',
          message: err instanceof Error ? err.message : 'Dataset gagal dimuat.',
          engineMode: client.mode,
        },
      }));
    } finally {
      off();
    }
  };

  /** Menandai kata terpakai. Mengembalikan true bila tercatat. */
  const commitMark = (word: string, lang: Language, via: UsedWord['via'], inDataset: boolean): boolean => {
    const { settings, used } = get();
    if (!settings.historyEnabled) {
      get().pushToast({ tone: 'info', message: 'Pencatatan kata sedang dimatikan di Pengaturan.' });
      return false;
    }
    const res = addUsed(used, { word, lang, via, inDataset }, settings.usedAcrossLanguages);
    if (res.duplicate) {
      get().pushToast({ tone: 'info', message: `${quote(res.duplicate.word)} sudah tercatat terpakai.` });
      return false;
    }
    const added = res.added!;
    set({ used: res.list, pendingConfirm: null });
    persistHistory();
    scheduleSync();
    get().pushToast(
      {
        tone: 'success',
        message: `Ditandai terpakai: ${quote(added.word)}`,
        actionLabel: 'Urungkan',
        onAction: () => get().removeUsed(added.id),
      },
      6000,
    );
    return true;
  };

  const lookupMany = async (keys: string[]): Promise<Map<string, LookupMatch[]>> => {
    const languages = languagesOf(get().settings.language);
    const unique = [...new Set(keys.filter(Boolean))];
    const out = new Map<string, LookupMatch[]>();
    if (unique.length === 0) return out;
    const results = await getEngine().request({ type: 'lookup', keys: unique, languages });
    unique.forEach((k, i) => out.set(k, results[i] ?? []));
    return out;
  };

  /** Alur penandaan dari teks (ketikan atau hasil suara). */
  const markFromAlternatives = async (alts: Alternative[], via: UsedWord['via']): Promise<void> => {
    const { settings } = get();
    if (get().dataset.status !== 'ready') {
      get().pushToast({ tone: 'info', message: 'Dataset belum siap. Tunggu hingga status dataset hijau.' });
      return;
    }
    const keys = alts.map((a) => foldKey(cleanMarkText(a.transcript)));
    const map = await lookupMany(keys);
    const resolution = resolveMark(alts, (k) => map.get(k) ?? [], {
      preferLang: recognitionLanguage(settings),
      // Input ketikan tidak punya bahasa ucapan: bila kebijakan per bahasa, tanyakan bahasanya.
      ambiguous: via === 'manual' && !settings.usedAcrossLanguages ? 'ask' : 'prefer',
    });

    if (resolution.status === 'confident') {
      commitMark(resolution.match.word, resolution.match.lang, via, true);
      return;
    }
    if (resolution.status === 'confirm') {
      set({ pendingConfirm: { type: 'choices', heard: resolution.heard, choices: resolution.choices, via } });
      return;
    }
    if (!resolution.key) {
      get().pushToast({ tone: 'error', message: 'Kata tidak terbaca. Coba ucapkan atau ketik lagi.' });
      return;
    }
    set({ pendingConfirm: { type: 'unknown', heard: resolution.heard, word: resolution.heard, via } });
  };

  return {
    hydrated: false,
    settings: structuredCloneSettings(DEFAULT_SETTINGS),
    used: [],
    custom: [],
    dataset: { status: 'idle', fraction: 0, stage: 'download', message: null, engineMode: 'worker' },
    manifest: null,
    mode: 'prefix',
    prefixText: '',
    markText: '',
    interim: '',
    lastHeard: '',
    rule: { prefix: '', tailLength: 0, short: false },
    result: null,
    searching: false,
    searchError: null,
    pendingConfirm: null,
    toasts: [],

    /* ----------------------------------------------------------------- Awal */

    async bootstrap() {
      if (bootstrapped) return;
      bootstrapped = true;
      const settings = loadSettings();
      set({ settings, hydrated: true });
      const [used, custom] = await Promise.all([
        historyStoreFor(settings.persistence).load(),
        customStore.load(),
      ]);
      set({ used, custom });
      await startDataset();
    },

    retryDataset() {
      void startDataset();
    },

    /* ------------------------------------------------------------ Pengaturan */

    patchSettings(patch) {
      const prev = get().settings;
      const next = sanitizeSettings({ ...prev, ...patch });
      set({ settings: next });
      saveSettings(next);

      if (prev.persistence !== next.persistence) {
        // Berpindah mode penyimpanan: salin riwayat saat ini ke tujuan, kosongkan asal.
        const { used } = get();
        void historyStoreFor(prev.persistence).clear();
        void historyStoreFor(next.persistence).save(used);
      }
      if (engineKey(prev) !== engineKey(next)) scheduleSync();
    },

    patchStrategy(patch) {
      const { settings } = get();
      get().patchSettings({ strategy: { ...settings.strategy, ...patch } });
    },

    patchRule(patch) {
      const { settings } = get();
      get().patchSettings({ rule: { ...settings.rule, ...patch } });
    },

    resetSettings() {
      const prevPersistence = get().settings.persistence;
      const next = structuredCloneSettings(DEFAULT_SETTINGS);
      set({ settings: next });
      saveSettings(next);
      if (prevPersistence !== next.persistence) {
        void historyStoreFor(prevPersistence).clear();
        void historyStoreFor(next.persistence).save(get().used);
      }
      scheduleSync();
    },

    /* ------------------------------------------------------------------ Input */

    setMode(mode) {
      set({ mode, interim: '' });
    },

    setInputText(text) {
      if (get().mode === 'mark') {
        set({ markText: text });
        return;
      }
      set({ prefixText: text });
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => void get().searchNow(), TYPING_DEBOUNCE_MS);
    },

    clearInput() {
      clearTimeout(typingTimer);
      clearTimeout(interimTimer);
      if (get().mode === 'mark') set({ markText: '', interim: '' });
      else {
        set({ prefixText: '', interim: '' });
        void get().searchNow();
      }
    },

    async searchNow() {
      clearTimeout(typingTimer);
      const { settings, prefixText, dataset } = get();
      const rule = resolveRule(prefixText, settings.rule);
      set({ rule });
      if (dataset.status !== 'ready') return;
      if (!rule.prefix) {
        searchSeq++;
        set({ result: null, searching: false, searchError: null });
        return;
      }
      const seq = ++searchSeq;
      set({ searching: true });
      try {
        const result = await getEngine().request({
          type: 'search',
          query: { prefix: rule.prefix, tailLength: rule.tailLength, strategy: settings.strategy, topN: 5 },
        });
        if (seq !== searchSeq) return; // hasil usang: pengguna sudah mengubah input
        set({ result, searching: false, searchError: null });
      } catch (err) {
        if (seq !== searchSeq) return;
        set({
          searching: false,
          searchError: err instanceof Error ? err.message : 'Pencarian gagal.',
        });
      }
    },

    /* ------------------------------------------------------------------ Suara */

    voiceInterim(text) {
      set({ interim: text });
      const { mode, settings } = get();
      if (mode !== 'prefix') return;
      const intent = parseTranscript(text, intentContext(settings, mode));
      if (intent.type !== 'prefix') return;
      // Hasil sementara masih berubah: cari hanya setelah stabil, agar tidak ada pencarian berulang.
      clearTimeout(interimTimer);
      interimTimer = setTimeout(() => {
        if (get().prefixText === intent.prefix) return;
        set({ prefixText: intent.prefix });
        void get().searchNow();
      }, INTERIM_STABLE_MS);
    },

    async voiceFinal(alts) {
      clearTimeout(interimTimer);
      const { mode, settings } = get();
      const ctx = intentContext(settings, mode);
      const heard = alts[0]?.transcript ?? '';
      set({ interim: '', lastHeard: heard });
      const intent = parseTranscript(heard, ctx);

      switch (intent.type) {
        case 'empty':
          get().pushToast({ tone: 'info', message: 'Ucapan tidak dikenali. Coba lagi.' });
          return;
        case 'prefix':
          set({ mode: 'prefix', prefixText: intent.prefix });
          await get().searchNow();
          return;
        case 'command':
          if (intent.command === 'undo') get().undo();
          else if (intent.command === 'clear') get().clearInput();
          else get().setMode(intent.command === 'mode-mark' ? 'mark' : 'prefix');
          return;
        case 'mark': {
          // Buang kata perintah ("tandai ...") dari setiap alternatif sebelum dicocokkan.
          const markAlts: Alternative[] = [];
          for (const a of alts) {
            const it = parseTranscript(a.transcript, { ...ctx, mode: 'mark' });
            if (it.type === 'mark') markAlts.push({ transcript: it.text, confidence: a.confidence });
          }
          set({ markText: intent.text });
          await markFromAlternatives(markAlts, 'voice');
          return;
        }
      }
    },

    /* ------------------------------------------------------------- Penandaan */

    async markCurrentText() {
      const text = get().markText.trim();
      if (!text) return;
      const v = validateWord(cleanMarkText(text).replace(/\s+/g, ''));
      if (!v.ok) {
        get().pushToast({ tone: 'error', message: `Kata tidak valid: ${v.reason.toLowerCase()}.` });
        return;
      }
      await markFromAlternatives([{ transcript: text, confidence: 1 }], 'manual');
      if (!get().pendingConfirm) set({ markText: '' });
    },

    markWordFromRow(word, lang) {
      commitMark(word, lang, 'button', true);
    },

    confirmChoice(match) {
      const pending = get().pendingConfirm;
      commitMark(match.word, match.lang, pending?.via ?? 'manual', true);
      set({ pendingConfirm: null, markText: '' });
    },

    confirmUnknown(lang) {
      const pending = get().pendingConfirm;
      if (!pending || pending.type !== 'unknown') return;
      const v = validateWord(pending.word.replace(/\s+/g, ''));
      if (!v.ok) {
        get().pushToast({ tone: 'error', message: `Kata tidak valid: ${v.reason.toLowerCase()}.` });
        set({ pendingConfirm: null });
        return;
      }
      commitMark(v.word, lang, pending.via, false);
      set({ pendingConfirm: null, markText: '' });
    },

    dismissConfirm() {
      set({ pendingConfirm: null });
    },

    searchFollowUp(word) {
      const { settings, prefixText } = get();
      const n = settings.rule.mode === 'fixed' ? settings.rule.fixedLength : Math.max(1, prefixText.length || 1);
      set({ mode: 'prefix', prefixText: tailOf(foldKey(word), n) });
      void get().searchNow();
    },

    /* --------------------------------------------------------------- Riwayat */

    undo() {
      const { used } = get();
      const { list, removed } = undoLast(used);
      if (!removed) {
        get().pushToast({ tone: 'info', message: 'Belum ada penandaan yang bisa dibatalkan.' });
        return;
      }
      set({ used: list });
      persistHistory();
      scheduleSync();
      get().pushToast({ tone: 'info', message: `Dibatalkan: ${quote(removed.word)}` });
    },

    removeUsed(id) {
      const { list, removed } = removeUsedFromList(get().used, id);
      if (!removed) return;
      set({ used: list });
      persistHistory();
      scheduleSync();
    },

    clearUsed() {
      set({ used: [] });
      persistHistory();
      scheduleSync();
      get().pushToast({ tone: 'info', message: 'Riwayat kata terpakai dikosongkan.' });
    },

    /* ----------------------------------------------------------- Kata khusus */

    async addCustomWord(word, lang) {
      const v = validateWord(word);
      if (!v.ok) return { ok: false, message: `${v.reason}.` };
      if (get().dataset.status !== 'ready') return { ok: false, message: 'Dataset belum siap.' };
      const { custom } = get();
      if (custom.some((c) => c.lang === lang && foldKey(c.word) === v.key)) {
        return { ok: false, message: 'Kata ini sudah ada di kata khusus.' };
      }
      const found = (await getEngine().request({ type: 'lookup', keys: [v.key], languages: [lang] }))[0] ?? [];
      if (found.some((m) => m.kind !== 'c')) {
        return { ok: false, message: 'Kata ini sudah ada di dataset bawaan.' };
      }
      const next = [...custom, { word: v.word, lang, addedAt: Date.now() }];
      set({ custom: next });
      persistCustom();
      await getEngine().request({ type: 'setCustom', words: next });
      scheduleSync();
      return { ok: true, message: `${quote(v.word)} ditambahkan.` };
    },

    removeCustomWord(word, lang) {
      const key = foldKey(word);
      const next = get().custom.filter((c) => !(c.lang === lang && foldKey(c.word) === key));
      set({ custom: next });
      persistCustom();
      void getEngine().request({ type: 'setCustom', words: next }).then(scheduleSync);
    },

    async importCustomWords(items) {
      const { custom } = get();
      const existing = new Set(custom.map((c) => `${c.lang}:${foldKey(c.word)}`));
      let alreadyCustom = 0;
      let alreadyInDataset = 0;
      const fresh: ImportedWord[] = [];
      const inDataset = new Set<string>();
      for (const lang of ['id', 'en'] as Language[]) {
        const keys = items.filter((i) => i.lang === lang).map((i) => foldKey(i.word));
        if (keys.length === 0) continue;
        const res = await getEngine().request({ type: 'lookup', keys, languages: [lang] });
        keys.forEach((k, i) => {
          if ((res[i] ?? []).some((m) => m.kind !== 'c')) inDataset.add(`${lang}:${k}`);
        });
      }
      for (const it of items) {
        const id = `${it.lang}:${foldKey(it.word)}`;
        if (existing.has(id)) alreadyCustom++;
        else if (inDataset.has(id)) alreadyInDataset++;
        else fresh.push(it);
      }
      if (fresh.length > 0) {
        const now = Date.now();
        const next = [...custom, ...fresh.map((f) => ({ word: f.word, lang: f.lang, addedAt: now }))];
        set({ custom: next });
        persistCustom();
        await getEngine().request({ type: 'setCustom', words: next });
        scheduleSync();
      }
      return { added: fresh.length, alreadyInDataset, alreadyCustom };
    },

    clearCustomWords() {
      set({ custom: [] });
      persistCustom();
      void getEngine().request({ type: 'setCustom', words: [] }).then(scheduleSync);
    },

    /* --------------------------------------------------------------- Dataset */

    browseDataset(q) {
      return getEngine().request({ type: 'browse', query: q });
    },

    datasetStats() {
      return getEngine().request({ type: 'stats' });
    },

    /* ----------------------------------------------------------------- Toast */

    pushToast(t, ttl = 4000) {
      const id = ++toastSeq;
      set((st) => ({ toasts: [...st.toasts.slice(-3), { ...t, id }] }));
      setTimeout(() => get().dismissToast(id), ttl);
      return id;
    },

    dismissToast(id) {
      set((st) => ({ toasts: st.toasts.filter((x) => x.id !== id) }));
    },
  };
});
