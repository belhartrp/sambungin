import { foldKey } from './normalize';
import { sanitizeUsedList } from './history';
import { SETTINGS_KEY, sanitizeSettings, structuredCloneSettings, DEFAULT_SETTINGS, type Settings } from './settings';
import type { CustomWord, UsedWord } from './types';

/** Subset antarmuka Storage yang dipakai, agar mudah diganti pada pengujian. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function safeStorage(kind: 'local' | 'session'): KeyValueStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null; // mode privat atau penyimpanan diblokir
  }
}

/* ------------------------------------------------------------------ Pengaturan */

export function loadSettings(storage: KeyValueStorage | null = safeStorage('local')): Settings {
  if (!storage) return structuredCloneSettings(DEFAULT_SETTINGS);
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    return sanitizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return structuredCloneSettings(DEFAULT_SETTINGS);
  }
}

export function saveSettings(
  settings: Settings,
  storage: KeyValueStorage | null = safeStorage('local'),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------------- Riwayat */

export interface HistoryStore {
  load(): Promise<UsedWord[]>;
  save(list: UsedWord[]): Promise<void>;
  clear(): Promise<void>;
}

export const SESSION_HISTORY_KEY = 'sambungin:history:session';

/** Riwayat per sesi tab: bertahan saat halaman dimuat ulang, hilang saat tab ditutup. */
export function createSessionHistoryStore(
  storage: KeyValueStorage | null = safeStorage('session'),
): HistoryStore {
  return {
    async load() {
      if (!storage) return [];
      try {
        const raw = storage.getItem(SESSION_HISTORY_KEY);
        return raw ? sanitizeUsedList(JSON.parse(raw)) : [];
      } catch {
        return [];
      }
    },
    async save(list) {
      if (!storage) return;
      try {
        storage.setItem(SESSION_HISTORY_KEY, JSON.stringify(list));
      } catch {
        /* kuota penuh atau diblokir: riwayat tetap ada di memori */
      }
    },
    async clear() {
      try {
        storage?.removeItem(SESSION_HISTORY_KEY);
      } catch {
        /* abaikan */
      }
    },
  };
}

/* -------------------------------------------------------------------- IndexedDB */

const DB_NAME = 'sambungin';
const DB_VERSION = 1;
const STORE_USED = 'used';
const STORE_CUSTOM = 'custom';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  if (!factory) return Promise.reject(new Error('IndexedDB tidak tersedia'));
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_USED)) db.createObjectStore(STORE_USED, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_CUSTOM)) db.createObjectStore(STORE_CUSTOM, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('Gagal membuka IndexedDB'));
    };
  });
  return dbPromise;
}

/** Menutup koneksi dan mengosongkan cache (dipakai pengujian). */
export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  try {
    (await dbPromise).close();
  } catch {
    /* abaikan */
  }
  dbPromise = null;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Transaksi IndexedDB gagal'));
    tx.onabort = () => reject(tx.error ?? new Error('Transaksi IndexedDB dibatalkan'));
  });
}

async function readAll<T>(storeName: string): Promise<T[]> {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readonly');
  const req = tx.objectStore(storeName).getAll();
  await txDone(tx);
  return req.result as T[];
}

async function replaceAll(storeName: string, items: unknown[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  store.clear();
  for (const item of items) store.put(item);
  await txDone(tx);
}

/** Riwayat lokal tahan lama (IndexedDB) sampai dihapus pengguna. */
export function createLocalHistoryStore(): HistoryStore {
  return {
    async load() {
      try {
        return sanitizeUsedList(await readAll<unknown>(STORE_USED));
      } catch {
        return [];
      }
    },
    async save(list) {
      try {
        await replaceAll(STORE_USED, list);
      } catch {
        /* IndexedDB tidak tersedia: riwayat tetap ada di memori */
      }
    },
    async clear() {
      try {
        await replaceAll(STORE_USED, []);
      } catch {
        /* abaikan */
      }
    },
  };
}

/* ------------------------------------------------------------------ Kata khusus */

interface CustomRow extends CustomWord {
  id: string;
}

export const customId = (word: string, lang: CustomWord['lang']): string => `${lang}:${foldKey(word)}`;

export interface CustomWordStore {
  load(): Promise<CustomWord[]>;
  save(words: CustomWord[]): Promise<void>;
}

/** Kata khusus selalu disimpan di IndexedDB karena merupakan kamus pribadi pengguna. */
export function createCustomWordStore(): CustomWordStore {
  return {
    async load() {
      try {
        const rows = await readAll<Partial<CustomRow>>(STORE_CUSTOM);
        const out: CustomWord[] = [];
        for (const r of rows) {
          if (typeof r.word !== 'string' || (r.lang !== 'id' && r.lang !== 'en')) continue;
          out.push({ word: r.word, lang: r.lang, addedAt: typeof r.addedAt === 'number' ? r.addedAt : 0 });
        }
        return out.sort((a, b) => a.addedAt - b.addedAt);
      } catch {
        return [];
      }
    },
    async save(words) {
      try {
        await replaceAll(
          STORE_CUSTOM,
          words.map((w) => ({ ...w, id: customId(w.word, w.lang) })),
        );
      } catch {
        /* abaikan */
      }
    },
  };
}
