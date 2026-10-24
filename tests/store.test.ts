import 'fake-indexeddb/auto';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApp } from '@/store/app';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { readData } from './helpers';

vi.stubGlobal('fetch', async (url: string) => {
  const name = path.basename(new URL(url, 'http://localhost').pathname);
  return new Response(readData(name));
});

const get = () => useApp.getState();

async function waitFor(cond: () => boolean, ms = 10_000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('waitFor: waktu habis');
    await new Promise((r) => setTimeout(r, 15));
  }
}
const settle = () => new Promise((r) => setTimeout(r, 60));

async function search(prefix: string): Promise<void> {
  get().setMode('prefix');
  useApp.setState({ prefixText: prefix });
  await get().searchNow();
}

beforeAll(async () => {
  await get().bootstrap();
  await waitFor(() => get().dataset.status === 'ready');
}, 30_000);

beforeEach(async () => {
  get().resetSettings();
  useApp.setState({ used: [], toasts: [], pendingConfirm: null, mode: 'prefix', markText: '', prefixText: '' });
  await settle();
});

describe('muat dataset', () => {
  it('dataset siap dan manifest tersedia', () => {
    expect(get().dataset.status).toBe('ready');
    expect(get().dataset.fraction).toBe(1);
    expect(get().manifest?.languages.id.count).toBeGreaterThan(50_000);
    expect(get().dataset.engineMode).toBe('inline'); // Node tidak punya Worker
  });
});

describe('pencarian dan bahasa', () => {
  it('awalan "ab" menampilkan kata dari dataset (tanpa tombol cari)', async () => {
    await search('ab');
    const r = get().result!;
    expect(r.prefix).toBe('ab');
    expect(r.words).toContain('abadi');
    expect(r.words).toContain('absolute');
    expect(get().rule.tailLength).toBe(2);
  });

  it('setInputText mencari otomatis setelah jeda singkat', async () => {
    get().setInputText('abs');
    await waitFor(() => get().result?.prefix === 'abs');
    expect(get().result!.words.every((w) => w.toLowerCase().startsWith('abs'))).toBe(true);
  });

  it('mengganti bahasa langsung memengaruhi hasil dan jumlah', async () => {
    await search('ab');
    const mixed = get().result!.rowCount;
    get().patchSettings({ language: 'id' });
    await waitFor(() => get().result!.langCounts.en === 0);
    const idOnly = get().result!.rowCount;
    expect(idOnly).toBeLessThan(mixed);
    get().patchSettings({ language: 'en' });
    await waitFor(() => get().result!.langCounts.id === 0 && get().result!.langCounts.en > 0);
    expect(get().result!.words).toContain('absolute');
    expect(get().result!.words).not.toContain('abadi');
  });

  it('awalan tanpa hasil memberi hasil kosong dengan hitungan nol', async () => {
    await search('zzqxj');
    expect(get().result!.matched).toBe(0);
  });

  it('awalan kosong menghapus hasil', async () => {
    await search('ab');
    await search('');
    expect(get().result).toBeNull();
  });

  it('aturan sambungan tetap N huruf: mengetik kata lawan utuh mengambil huruf terakhir', async () => {
    get().patchRule({ mode: 'fixed', fixedLength: 1 });
    await search('enemy');
    expect(get().rule).toMatchObject({ prefix: 'y', tailLength: 1 });
    expect(get().result!.prefix).toBe('y');
    get().patchRule({ fixedLength: 2 });
    await waitFor(() => get().result?.prefix === 'my');
  });
});

describe('kata terpakai', () => {
  it('menandai kata mengecualikannya dari hasil, undo mengembalikannya', async () => {
    get().patchSettings({ language: 'id' });
    await search('abad');
    await waitFor(() => get().result!.words.includes('abadi'));
    get().markWordFromRow('abadi', 'id');
    expect(get().used).toHaveLength(1);
    await waitFor(() => !get().result!.words.includes('abadi'));
    expect(get().result!.usedMatched).toBe(1);

    get().undo();
    expect(get().used).toHaveLength(0);
    await waitFor(() => get().result!.words.includes('abadi'));
  });

  it('filter dimatikan: kata terpakai muncul kembali dengan penanda', async () => {
    get().patchSettings({ language: 'id' });
    await search('abad');
    get().markWordFromRow('abadi', 'id');
    await waitFor(() => !get().result!.words.includes('abadi'));
    get().patchSettings({ excludeUsed: false });
    await waitFor(() => get().result!.words.includes('abadi'));
    const i = get().result!.words.indexOf('abadi');
    expect(get().result!.used[i]).toBe(1);
    expect(get().used).toHaveLength(1); // riwayat tidak dihapus
  });

  it('duplikat ditolak dan hapus satu entri serta reset bekerja', () => {
    get().markWordFromRow('abadi', 'id');
    get().markWordFromRow('Abadi', 'id');
    expect(get().used).toHaveLength(1);
    get().markWordFromRow('absen', 'id');
    get().removeUsed(get().used[0]!.id);
    expect(get().used.map((u) => u.word)).toEqual(['absen']);
    get().clearUsed();
    expect(get().used).toEqual([]);
  });

  it('pencatatan dimatikan: penandaan ditolak dengan pesan', () => {
    get().patchSettings({ historyEnabled: false });
    get().markWordFromRow('abadi', 'id');
    expect(get().used).toHaveLength(0);
    expect(get().toasts.at(-1)!.message).toContain('dimatikan');
  });

  it('mode tandai (manual): kata di dataset langsung tercatat; tidak dikenal -> konfirmasi', async () => {
    get().setMode('mark');
    get().setInputText('absolute');
    await get().markCurrentText();
    expect(get().used.map((u) => u.word)).toEqual(['absolute']);
    expect(get().used[0]!.inDataset).toBe(true);

    get().setInputText('zzqxjwv');
    await get().markCurrentText();
    expect(get().pendingConfirm?.type).toBe('unknown');
    expect(get().used).toHaveLength(1);
    get().confirmUnknown('id');
    expect(get().used.at(-1)).toMatchObject({ word: 'zzqxjwv', inDataset: false, lang: 'id' });
  });

  it('kata di dua bahasa dengan kebijakan per bahasa meminta pilihan bahasa', async () => {
    get().patchSettings({ usedAcrossLanguages: false });
    get().setMode('mark');
    get().setInputText('hotel');
    await get().markCurrentText();
    const p = get().pendingConfirm;
    expect(p?.type).toBe('choices');
    if (p?.type === 'choices') {
      expect(p.choices.map((c) => c.lang).sort()).toEqual(['en', 'id']);
      get().confirmChoice(p.choices.find((c) => c.lang === 'en')!);
    }
    expect(get().used).toMatchObject([{ word: 'hotel', lang: 'en' }]);
  });
});

describe('suara', () => {
  it('hasil sementara tidak mengubah riwayat', async () => {
    get().setMode('mark');
    get().voiceInterim('absolute');
    await settle();
    expect(get().used).toHaveLength(0);
    expect(get().interim).toBe('absolute');
  });

  it('hasil sementara di mode awalan baru mencari setelah stabil', async () => {
    get().voiceInterim('a b');
    expect(get().prefixText).toBe('');
    await waitFor(() => get().prefixText === 'ab', 3000);
  });

  it('final di mode awalan: ucapan huruf menjadi awalan, bukan kata terpakai', async () => {
    await get().voiceFinal([{ transcript: 'a be es', confidence: 0.9 }]);
    expect(get().prefixText).toBe('abs');
    expect(get().used).toHaveLength(0);
    expect(get().result!.prefix).toBe('abs');
  });

  it('final di mode tandai dengan keyakinan tinggi langsung menandai', async () => {
    get().setMode('mark');
    await get().voiceFinal([{ transcript: 'absolute', confidence: 0.95 }]);
    expect(get().used.map((u) => u.word)).toEqual(['absolute']);
    expect(get().used[0]!.via).toBe('voice');
  });

  it('keyakinan rendah meminta konfirmasi dan tidak mengubah riwayat', async () => {
    get().setMode('mark');
    await get().voiceFinal([{ transcript: 'absolute', confidence: 0.3 }]);
    expect(get().pendingConfirm?.type).toBe('choices');
    expect(get().used).toHaveLength(0);
    get().dismissConfirm();
    expect(get().pendingConfirm).toBeNull();
  });

  it('perintah "tandai X" bekerja walau di mode awalan; "batalkan" membatalkan', async () => {
    await get().voiceFinal([{ transcript: 'tandai absurd', confidence: 0.95 }]);
    expect(get().used.map((u) => u.word)).toEqual(['absurd']);
    await get().voiceFinal([{ transcript: 'batalkan', confidence: 0.95 }]);
    expect(get().used).toHaveLength(0);
  });

  it('perintah suara dimatikan: "tandai ..." tidak menandai apa pun', async () => {
    get().patchSettings({ voiceCommands: false });
    await get().voiceFinal([{ transcript: 'tandai absurd', confidence: 0.95 }]);
    expect(get().used).toHaveLength(0);
  });
});

describe('kata khusus', () => {
  it('menambah, muncul di hasil, menolak duplikat bawaan, dan menghapus', async () => {
    const ok = await get().addCustomWord('zzkhususku', 'id');
    expect(ok.ok).toBe(true);
    await search('zzkhus');
    expect(get().result!.words).toContain('zzkhususku');

    expect((await get().addCustomWord('zzkhususku', 'id')).ok).toBe(false);
    expect((await get().addCustomWord('abadi', 'id')).message).toContain('dataset bawaan');
    expect((await get().addCustomWord('bad word', 'id')).ok).toBe(false);

    get().removeCustomWord('zzkhususku', 'id');
    await waitFor(() => get().custom.length === 0);
    await settle();
    await get().searchNow();
    expect(get().result!.words).not.toContain('zzkhususku');
  });

  it('impor menghitung yang baru, sudah ada di dataset, dan sudah ada di kata khusus', async () => {
    const r1 = await get().importCustomWords([
      { word: 'zzimporta', lang: 'id' },
      { word: 'abadi', lang: 'id' },
    ]);
    expect(r1).toEqual({ added: 1, alreadyInDataset: 1, alreadyCustom: 0 });
    const r2 = await get().importCustomWords([{ word: 'zzimporta', lang: 'id' }]);
    expect(r2).toEqual({ added: 0, alreadyInDataset: 0, alreadyCustom: 1 });
    get().clearCustomWords();
    expect(get().custom).toEqual([]);
  });
});

describe('pengaturan', () => {
  it('reset mengembalikan nilai bawaan', () => {
    get().patchSettings({ language: 'en', view: 'split' });
    get().resetSettings();
    expect(get().settings).toEqual(DEFAULT_SETTINGS);
  });

  it('input manual dipaksa aktif bila suara dimatikan bersama manual', () => {
    get().patchSettings({ voiceInput: false, manualInput: false });
    expect(get().settings.manualInput).toBe(true);
  });
});
