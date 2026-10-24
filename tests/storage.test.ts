import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, effectiveInputs, engineConfigFrom, sanitizeSettings } from '@/lib/settings';
import {
  SESSION_HISTORY_KEY,
  closeDb,
  createCustomWordStore,
  createLocalHistoryStore,
  createSessionHistoryStore,
  loadSettings,
  saveSettings,
  type KeyValueStorage,
} from '@/lib/storage';
import type { UsedWord } from '@/lib/types';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const used = (word: string, at: number): UsedWord => ({
  id: `id-${word}`, key: word, word, lang: 'id', at, via: 'manual', inDataset: true,
});

afterEach(async () => {
  await createLocalHistoryStore().clear();
  await createCustomWordStore().save([]);
  await closeDb();
});

describe('pengaturan', () => {
  it('menyimpan dan memuat kembali (persistensi pengaturan)', () => {
    const s = memoryStorage();
    const custom = { ...DEFAULT_SETTINGS, language: 'en' as const, view: 'split' as const, searchTier: 2 as const };
    expect(saveSettings(custom, s)).toBe(true);
    expect(loadSettings(s)).toEqual(custom);
  });

  it('data rusak atau tidak valid kembali ke nilai bawaan', () => {
    const s = memoryStorage();
    s.setItem('sambungin:settings', '{bukan json');
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ language: 'fr', view: 9, searchTier: 7, rule: { mode: 'x', fixedLength: 999 } })).toMatchObject({
      language: 'mixed', view: 'single', searchTier: 3, rule: { mode: 'auto', fixedLength: 6 },
    });
  });

  it('tanpa penyimpanan (mode privat) tetap berfungsi dengan nilai bawaan', () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(DEFAULT_SETTINGS, null)).toBe(false);
  });

  it('input manual dipaksa aktif bila suara juga dimatikan', () => {
    expect(sanitizeSettings({ voiceInput: false, manualInput: false }).manualInput).toBe(true);
  });

  it('fallback manual: tanpa dukungan suara, input manual selalu tersedia', () => {
    expect(effectiveInputs({ voiceInput: true, manualInput: false }, false)).toEqual({ voice: false, manual: true });
    expect(effectiveInputs({ voiceInput: true, manualInput: true }, true)).toEqual({ voice: true, manual: true });
    expect(effectiveInputs({ voiceInput: false, manualInput: false }, true)).toEqual({ voice: false, manual: true });
  });

  it('konfigurasi mesin diturunkan dari pengaturan: bahasa dan kebijakan riwayat', () => {
    const cfg = engineConfigFrom({ ...DEFAULT_SETTINGS, language: 'id', excludeUsed: false }, [{ key: 'abu', lang: 'id' }]);
    expect(cfg.languages).toEqual(['id']);
    expect(cfg.excludeUsed).toBe(false);
    expect(cfg.used).toEqual([{ key: 'abu', lang: 'id' }]);
    expect(engineConfigFrom(DEFAULT_SETTINGS, []).languages).toEqual(['id', 'en']);
  });
});

describe('riwayat per sesi', () => {
  it('bertahan saat muat ulang dalam sesi yang sama dan dapat dikosongkan', async () => {
    const s = memoryStorage();
    await createSessionHistoryStore(s).save([used('abu', 1)]);
    expect(await createSessionHistoryStore(s).load()).toHaveLength(1);
    await createSessionHistoryStore(s).clear();
    expect(s.data.has(SESSION_HISTORY_KEY)).toBe(false);
    expect(await createSessionHistoryStore(s).load()).toEqual([]);
  });

  it('data rusak tidak membuat aplikasi gagal', async () => {
    const s = memoryStorage();
    s.setItem(SESSION_HISTORY_KEY, '[[[');
    expect(await createSessionHistoryStore(s).load()).toEqual([]);
  });
});

describe('riwayat lokal (IndexedDB)', () => {
  it('menyimpan, memuat kembali, menimpa, dan menghapus', async () => {
    const store = createLocalHistoryStore();
    await store.save([used('abu', 1), used('enak', 2)]);
    expect((await store.load()).map((u) => u.word)).toEqual(['abu', 'enak']);
    await store.save([used('abu', 1)]);
    expect(await store.load()).toHaveLength(1);
    await store.clear();
    expect(await store.load()).toEqual([]);
  });
});

describe('kata khusus (IndexedDB)', () => {
  it('menyimpan dan memuat kata khusus berurutan menurut waktu', async () => {
    const store = createCustomWordStore();
    await store.save([
      { word: 'cuan', lang: 'id', addedAt: 2 },
      { word: 'rizz', lang: 'en', addedAt: 1 },
    ]);
    expect((await store.load()).map((w) => w.word)).toEqual(['rizz', 'cuan']);
  });
});
