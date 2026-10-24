import { describe, expect, it } from 'vitest';
import { parseLangList } from '@/lib/lexicon';
import { foldKey } from '@/lib/normalize';
import { DEFAULT_ENGINE_CONFIG } from '@/lib/engine';
import { readData, realEngine, strategy } from './helpers';

const manifest = JSON.parse(readData('manifest.json')) as {
  languages: Record<'id' | 'en', { count: number }>;
  sources: { lang: string; bit: number; license: string }[];
};

describe('integritas berkas dataset', () => {
  for (const [lang, idx] of [['id', 0], ['en', 1]] as const) {
    it(`id/en ${lang}: terurut menurut kunci, unik, dan tanpa baris rusak`, () => {
      const { list, skipped } = parseLangList(idx, readData(`${lang}.txt`));
      expect(skipped).toBe(0);
      expect(list.keys.length).toBe(manifest.languages[lang].count);
      for (let i = 1; i < list.keys.length; i++) {
        if (!(list.keys[i - 1]! < list.keys[i]!)) {
          throw new Error(`Urutan/duplikat salah di baris ${i}: ${list.keys[i - 1]} / ${list.keys[i]}`);
        }
      }
    });

    it(`${lang}: kunci konsisten dengan foldKey dan hanya berisi a-z`, () => {
      const { list } = parseLangList(idx, readData(`${lang}.txt`));
      for (let i = 0; i < list.words.length; i += 97) {
        expect(list.keys[i]).toBe(foldKey(list.words[i]!));
        expect(/^[a-z]+$/.test(list.keys[i]!)).toBe(true);
      }
    });
  }

  it('manifest mendokumentasikan sumber dan lisensi untuk kedua bahasa', () => {
    expect(manifest.sources.filter((s) => s.lang === 'id').length).toBeGreaterThanOrEqual(2);
    expect(manifest.sources.filter((s) => s.lang === 'en').length).toBeGreaterThanOrEqual(2);
    expect(manifest.sources.every((s) => s.license.length > 0)).toBe(true);
  });

  it('cakupan memadai (bukan puluhan kata manual)', () => {
    expect(manifest.languages.id.count).toBeGreaterThan(50_000);
    expect(manifest.languages.en.count).toBeGreaterThan(200_000);
  });
});

describe('pencarian pada dataset asli', () => {
  const run = (languages: ('id' | 'en')[], prefix: string) => {
    const e = realEngine();
    e.configure({ ...DEFAULT_ENGINE_CONFIG, languages });
    return e.search({ prefix, tailLength: prefix.length, strategy: strategy() });
  };

  it('awalan "ab" Indonesia memuat kata yang diharapkan dan hanya kata Indonesia', () => {
    const r = run(['id'], 'ab');
    for (const w of ['abadi', 'abad', 'absen', 'abnormal', 'absolut', 'absurd']) {
      expect(r.words, w).toContain(w);
    }
    expect([...r.langs].every((l) => l === 0)).toBe(true);
    expect(r.words.every((w) => foldKey(w).startsWith('ab'))).toBe(true);
  });

  it('awalan "ab" English memuat kata yang diharapkan', () => {
    const r = run(['en'], 'ab');
    for (const w of ['absolute', 'abstract', 'absorb', 'absurd']) expect(r.words, w).toContain(w);
    expect([...r.langs].every((l) => l === 1)).toBe(true);
  });

  it('mode campuran memuat keduanya dan hasilnya adalah gabungan kedua bahasa', () => {
    const both = run(['id', 'en'], 'ab');
    const id = run(['id'], 'ab');
    const en = run(['en'], 'ab');
    expect(both.rowCount).toBe(id.rowCount + en.rowCount);
  });

  it('awalan "a" menghasilkan banyak kata dan selesai cepat', () => {
    const t0 = performance.now();
    const r = run(['id', 'en'], 'a');
    const ms = performance.now() - t0;
    expect(r.rowCount).toBeGreaterThan(20_000);
    expect(ms).toBeLessThan(2500);
  });

  it('hitungan kelanjutan identik dengan penghitungan brute force', () => {
    const e = realEngine();
    e.configure({
      ...DEFAULT_ENGINE_CONFIG,
      languages: ['id', 'en'],
      opponentTier: 2,
      used: [{ key: 'enemy', lang: 'en' }, { key: 'ekor', lang: 'id' }],
    });
    const lex = e.lexicon;
    for (const tail of ['x', 'y', 'q', 'ab', 'ng', 'zz', 'enem', 'ek']) {
      const unique = new Set<string>();
      for (let i = 0; i < lex.length; i++) {
        if (!lex.keys[i]!.startsWith(tail)) continue;
        if (lex.tier[i]! > 2) continue;
        if (lex.keys[i] === 'enemy' || lex.keys[i] === 'ekor') continue; // terpakai (lintas bahasa)
        unique.add(lex.keys[i]!);
      }
      expect(e.continuationCount(tail), tail).toBe(unique.size);
    }
  });

  it('akhiran langka menghasilkan rekomendasi buntu atau sangat sulit', () => {
    const e = realEngine();
    e.configure({ ...DEFAULT_ENGINE_CONFIG, languages: ['en'], opponentTier: 2 });
    const r = e.search({ prefix: 'ab', tailLength: 1, strategy: strategy() });
    const best = r.top[0]!;
    expect(r.cont[best]!).toBeLessThanOrEqual(r.cont[r.order[r.rowCount - 1]!]!);
    expect(r.scores[best]!).toBeGreaterThanOrEqual(r.scores[r.top[r.top.length - 1]!]!);
  });

  it('configure ulang (mis. saat menandai kata) cukup cepat untuk dipakai saat bermain', () => {
    const e = realEngine();
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) e.configure({ ...DEFAULT_ENGINE_CONFIG, used: [{ key: 'abadi', lang: 'id' }] });
    expect((performance.now() - t0) / 5).toBeLessThan(400);
  });
});

describe('kualitas rekomendasi', () => {
  it('singkatan dikenali dan tidak mendominasi rekomendasi teratas bahasa Indonesia', () => {
    const e = realEngine();
    e.configure({ ...DEFAULT_ENGINE_CONFIG, languages: ['id'], opponentTier: 2 });
    for (const w of ['abg', 'abk']) {
      const m = e.lookup([w], ['id'])[0]![0]!;
      expect(m.kind, w).toBe('s');
    }
    for (const w of ['abdi', 'lift', 'golf', 'input']) {
      expect(e.lookup([w], ['id'])[0]![0]?.kind, w).toBe('d');
    }
    const r = e.search({ prefix: 'ab', tailLength: 1, strategy: strategy() });
    const kinds = r.top.map((i) => r.kinds[i]);
    expect(r.top.length).toBe(5);
    expect(kinds.every((k) => k === 0)).toBe(true); // semuanya kata kamus (kode 0)
  });

  it('rekomendasi dengan skor seri tidak sekadar alfabetis (kata pendek didahulukan)', () => {
    const e = realEngine();
    e.configure({ ...DEFAULT_ENGINE_CONFIG, languages: ['en'], opponentTier: 2 });
    const r = e.search({ prefix: 'ab', tailLength: 1, strategy: strategy() });
    const top = r.top.map((i) => r.words[i]!);
    const lens = top.map((w) => w.length);
    expect(new Set(r.top.map((i) => r.scores[i])).size).toBe(1);
    expect(lens).toEqual([...lens].sort((a, b) => a - b));
  });
});
