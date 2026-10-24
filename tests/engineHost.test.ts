import { describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE_CONFIG } from '@/lib/engine';
import { EngineHost, type FetchText } from '@/lib/engineHost';
import { readData, strategy } from './helpers';

const fakeFetch: FetchText = async (url, onBytes) => {
  const name = url.includes('/id.txt') ? 'id.txt' : 'en.txt';
  const text = readData(name);
  onBytes(text.length);
  return text;
};

describe('EngineHost (protokol worker)', () => {
  it('init memuat dataset dengan versi pada URL dan melaporkan kemajuan', async () => {
    const urls: string[] = [];
    const host = new EngineHost(async (u, b) => (urls.push(u), fakeFetch(u, b)));
    const progress: number[] = [];
    const { payload } = await host.handle(
      { type: 'init', baseUrl: '/data', version: '2026-10-24', expectedBytes: 4_700_000 },
      (f) => progress.push(f),
    );
    expect(payload).toMatchObject({ skipped: 0 });
    expect((payload as { id: number }).id).toBeGreaterThan(50_000);
    expect(urls.every((u) => u.endsWith('?v=2026-10-24'))).toBe(true);
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((f, i) => i === 0 || f >= progress[i - 1]!)).toBe(true);
  });

  it('alur lengkap: configure, search, lookup, browse, stats', async () => {
    const host = new EngineHost(fakeFetch);
    await host.handle({ type: 'init', baseUrl: '/data', version: '1' });
    await host.handle({ type: 'configure', config: { ...DEFAULT_ENGINE_CONFIG, languages: ['id'] } });

    const s = await host.handle({ type: 'search', query: { prefix: 'ab', tailLength: 2, strategy: strategy() } });
    const result = s.payload as import('@/lib/engine').SearchResult;
    expect(result.words).toContain('abadi');
    expect(s.transfer.length).toBe(7);

    const l = await host.handle({ type: 'lookup', keys: ['abadi'], languages: ['id'] });
    expect((l.payload as unknown[][])[0]).toHaveLength(1);

    const b = await host.handle({ type: 'browse', query: { lang: 'id', query: 'abad', mode: 'prefix', limit: 5 } });
    expect((b.payload as { rows: unknown[] }).rows.length).toBeGreaterThan(0);

    const st = await host.handle({ type: 'stats' });
    expect((st.payload as { total: number }).total).toBeGreaterThan(300_000);
  });

  it('kata khusus berlaku setelah setCustom dan configure ulang tetap menjaganya', async () => {
    const host = new EngineHost(fakeFetch);
    await host.handle({ type: 'init', baseUrl: '/data', version: '1' });
    await host.handle({ type: 'setCustom', words: [{ word: 'zzkatakhusus', lang: 'id', addedAt: 1 }] });
    await host.handle({ type: 'configure', config: { ...DEFAULT_ENGINE_CONFIG, languages: ['id'] } });
    const r = (await host.handle({ type: 'search', query: { prefix: 'zzkata', tailLength: 1, strategy: strategy() } }))
      .payload as import('@/lib/engine').SearchResult;
    expect(r.words).toEqual(['zzkatakhusus']);
  });

  it('galat unduhan dirambatkan agar UI dapat menampilkan status error', async () => {
    const host = new EngineHost(async () => {
      throw new Error('jaringan putus');
    });
    await expect(host.handle({ type: 'init', baseUrl: '/data', version: '1' })).rejects.toThrow('jaringan putus');
  });
});
