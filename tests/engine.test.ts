import { describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE_CONFIG } from '@/lib/engine';
import { resolveRule } from '@/lib/rules';
import { makeEngine, strategy } from './helpers';

const ID = ['abadi', 'abad', 'absen', 'abnormal', 'absolut', 'enak', 'edan', 'emas', 'ia', 'hotel'];
const EN = ['absolute', 'abstract', 'absorb', 'absurd', 'apple', 'enemy', 'easy', 'yes', 'hotel', 'ab'];

const words = (r: ReturnType<ReturnType<typeof makeEngine>['search']>) => [...r.words].sort();
const q = (prefix: string, n = prefix.length, s = strategy()) => ({ prefix, tailLength: n, strategy: s });

describe('pencarian awalan', () => {
  it('awalan "a" mengembalikan semua kata berawalan a dari kedua bahasa', () => {
    const e = makeEngine(ID, EN);
    const r = e.search(q('a'));
    expect(words(r)).toEqual(
      ['ab', 'abad', 'abadi', 'abnormal', 'absen', 'absolut', 'absolute', 'absorb', 'abstract', 'absurd', 'apple'].sort(),
    );
  });

  it('awalan "ab" hanya memuat kata berawalan ab', () => {
    const r = makeEngine(ID, EN).search(q('ab'));
    expect(r.words.every((w) => w.startsWith('ab'))).toBe(true);
    expect(r.words).toContain('absolute');
    expect(r.words).not.toContain('apple');
  });

  it('awalan tanpa hasil mengembalikan daftar kosong dengan hitungan nol', () => {
    const r = makeEngine(ID, EN).search(q('zzq'));
    expect(r.rowCount).toBe(0);
    expect(r.matched).toBe(0);
    expect(r.top).toEqual([]);
  });

  it('awalan kosong tidak mengembalikan apa pun (tidak memindai seluruh dataset)', () => {
    const r = makeEngine(ID, EN).search(q(''));
    expect(r.rowCount).toBe(0);
  });
});

describe('filter bahasa', () => {
  it('Indonesia hanya memuat kosakata Indonesia', () => {
    const r = makeEngine(ID, EN, { languages: ['id'] }).search(q('ab'));
    expect([...r.langs].every((l) => l === 0)).toBe(true);
    expect(r.words).toContain('abadi');
    expect(r.words).not.toContain('absolute');
  });

  it('English hanya memuat kosakata Inggris', () => {
    const r = makeEngine(ID, EN, { languages: ['en'] }).search(q('ab'));
    expect([...r.langs].every((l) => l === 1)).toBe(true);
    expect(r.words).toContain('absolute');
    expect(r.words).not.toContain('abadi');
  });

  it('mode campuran memuat keduanya dan menandai bahasa tiap baris', () => {
    const r = makeEngine(ID, EN).search(q('ab'));
    expect(r.langCounts.id).toBeGreaterThan(0);
    expect(r.langCounts.en).toBeGreaterThan(0);
    const i = r.words.indexOf('absolute');
    expect(r.langs[i]).toBe(1);
  });

  it('kata yang sama di dua bahasa tampil sebagai dua baris berlabel berbeda', () => {
    const r = makeEngine(ID, EN).search(q('hotel'));
    expect(r.rowCount).toBe(2);
    expect([...r.langs].sort()).toEqual([0, 1]);
  });
});

describe('jumlah kelanjutan', () => {
  it('menghitung kata yang DIMULAI dengan akhiran, bukan yang berakhiran', () => {
    // "absolute" berakhiran "e". Kata berawalan e: enak, edan, emas (id) + enemy, easy (en) = 5.
    // "apple" (berakhiran e) tidak boleh ikut terhitung.
    const e = makeEngine(ID, EN);
    const r = e.search(q('absol', 1));
    const i = r.words.indexOf('absolute');
    expect(r.cont[i]).toBe(5);
    expect(e.continuationCount('e')).toBe(5);
  });

  it('mengikuti jumlah huruf aturan sambungan (2 huruf)', () => {
    const e = makeEngine(['absen', 'enak', 'ensiklopedia', 'enam'], []);
    const r = e.search(q('abs', 2));
    // "absen" berakhiran "en": kata berawalan "en" = enak, ensiklopedia, enam = 3.
    expect(r.cont[r.words.indexOf('absen')]).toBe(3);
  });

  it('tidak menghitung kata yang sama dua kali akibat duplikasi data', () => {
    const e = makeEngine(['ab', 'ab', 'abe', 'enak', 'enak'], []);
    expect(e.search(q('ab')).rowCount).toBe(2); // ab, abe (duplikat dibuang saat penggabungan)
    expect(e.continuationCount('en')).toBe(1);
  });

  it('kunci yang sama di dua bahasa dihitung sekali sebagai pilihan lanjutan', () => {
    const e = makeEngine(['hotel', 'kota'], ['hotel', 'tab']);
    const r = e.search(q('kot', 1));
    // "kota" berakhiran "a": tidak ada kata berawalan a -> 0. Cek "tab" -> akhiran "b".
    expect(r.cont[r.words.indexOf('kota')]).toBe(0);
    expect(e.continuationCount('ho')).toBe(1);
  });

  it('kandidat tidak dihitung sebagai pilihan lanjutan bagi dirinya sendiri', () => {
    // "abab" berakhiran "ab" dan sendiri berawalan "ab". Setelah dimainkan ia terpakai.
    const e = makeEngine(['abab', 'abu'], []);
    const r = e.search(q('ab', 2));
    expect(e.continuationCount('ab')).toBe(2);
    expect(r.cont[r.words.indexOf('abab')]).toBe(1); // hanya "abu"
  });

  it('kata terpakai tidak dihitung sebagai pilihan lanjutan', () => {
    const base = makeEngine(['absolut', 'enak', 'edan'], []);
    expect(base.continuationCount('e')).toBe(2);
    const used = makeEngine(['absolut', 'enak', 'edan'], [], { used: [{ key: 'enak', lang: 'id' }] });
    expect(used.continuationCount('e')).toBe(1);
  });

  it('kosakata lawan membatasi kata yang dihitung (tingkat)', () => {
    const id = ['absolut', 'enak', 'ekstrak:d3', 'ekabakti:d3'];
    const luas = makeEngine(id, [], { opponentTier: 3 });
    const umum = makeEngine(id, [], { opponentTier: 2 });
    expect(luas.continuationCount('e')).toBe(3);
    expect(umum.continuationCount('e')).toBe(1);
  });
});

describe('aturan sambungan', () => {
  it('mode fixed memakai N huruf terakhir input sebagai awalan', () => {
    expect(resolveRule('enemy', { mode: 'fixed', fixedLength: 1 })).toMatchObject({ prefix: 'y', tailLength: 1 });
    expect(resolveRule('enemy', { mode: 'fixed', fixedLength: 2 })).toMatchObject({ prefix: 'my', tailLength: 2 });
  });

  it('mode auto memakai seluruh input dan panjangnya sebagai panjang akhiran', () => {
    expect(resolveRule('abs', { mode: 'auto', fixedLength: 1 })).toMatchObject({ prefix: 'abs', tailLength: 3 });
  });

  it('input lebih pendek dari panjang tetap ditandai short', () => {
    expect(resolveRule('a', { mode: 'fixed', fixedLength: 2 })).toMatchObject({ prefix: 'a', short: true });
  });

  it('awalan, hitungan kelanjutan, dan rekomendasi memakai panjang yang sama', () => {
    // Lawan memainkan "enemy"; aturan 2 huruf -> kita harus memakai kata berawalan "my".
    const e = makeEngine(['myth', 'mystic', 'thor', 'thumb', 'tick'], []);
    const rule = resolveRule('enemy', { mode: 'fixed', fixedLength: 2 });
    expect(rule.prefix).toBe('my');
    const r = e.search({ prefix: rule.prefix, tailLength: rule.tailLength, strategy: strategy() });
    expect(r.words.sort()).toEqual(['mystic', 'myth']);
    // "myth" berakhiran "th": kata berawalan "th" = thor, thumb (2). "mystic" -> "ic": 0.
    expect(r.cont[r.words.indexOf('myth')]).toBe(2);
    expect(r.cont[r.words.indexOf('mystic')]).toBe(0);
    // Rekomendasi teratas harus yang membuat lawan buntu.
    expect(r.words[r.top[0]!]).toBe('mystic');
  });
});

describe('kata terpakai', () => {
  const cfg = { used: [{ key: 'absolute', lang: 'en' as const }] };

  it('dikecualikan dari hasil dan rekomendasi saat filter aktif', () => {
    const r = makeEngine(ID, EN, cfg).search(q('ab'));
    expect(r.words).not.toContain('absolute');
    expect(r.usedMatched).toBe(1);
    expect(r.available).toBe(r.matched - 1);
    expect(r.top.map((i) => r.words[i])).not.toContain('absolute');
  });

  it('muncul kembali dengan penanda saat filter dimatikan', () => {
    const r = makeEngine(ID, EN, { ...cfg, excludeUsed: false }).search(q('ab'));
    const i = r.words.indexOf('absolute');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(r.used[i]).toBe(1);
    expect(r.top.map((x) => r.words[x])).not.toContain('absolute'); // tidak pernah direkomendasikan
  });

  it('kebijakan lintas bahasa: kata terpakai berlaku untuk kedua bahasa', () => {
    const across = makeEngine(ID, EN, { used: [{ key: 'hotel', lang: 'en' }], usedAcrossLanguages: true });
    expect(across.search(q('hotel')).rowCount).toBe(0);
    const perLang = makeEngine(ID, EN, { used: [{ key: 'hotel', lang: 'en' }], usedAcrossLanguages: false });
    const r = perLang.search(q('hotel'));
    expect(r.rowCount).toBe(1);
    expect(r.langs[0]).toBe(0);
  });

  it('semua kata cocok terpakai: available nol tetapi matched tetap tercatat', () => {
    const e = makeEngine(['abu'], [], { used: [{ key: 'abu', lang: 'id' }] });
    const r = e.search(q('ab'));
    expect(r.matched).toBe(1);
    expect(r.available).toBe(0);
    expect(r.rowCount).toBe(0);
  });
});

describe('kategori dan cakupan', () => {
  const id = ['abu', 'abg:p2', 'aceh:n2', 'abyssal:d3'];

  it('kata populer disembunyikan bila dimatikan', () => {
    const on = makeEngine(id, [], { includeInformal: true }).search(q('ab'));
    const off = makeEngine(id, [], { includeInformal: false }).search(q('ab'));
    expect(on.words).toContain('abg');
    expect(off.words).not.toContain('abg');
  });

  it('nama tempat disembunyikan bila dimatikan', () => {
    expect(makeEngine(id, [], { includeNames: false }).search(q('ac')).words).toEqual([]);
    expect(makeEngine(id, [], { includeNames: true }).search(q('ac')).words).toEqual(['aceh']);
  });

  it('cakupan pencarian membatasi tingkat kata', () => {
    expect(makeEngine(id, [], { searchTier: 2 }).search(q('ab')).words).not.toContain('abyssal');
    expect(makeEngine(id, [], { searchTier: 3 }).search(q('ab')).words).toContain('abyssal');
  });
});

describe('kata khusus dan pencarian kata', () => {
  it('kata khusus masuk ke hasil dan tidak menggandakan kata bawaan', () => {
    const e = makeEngine(['abu'], []);
    const res = e.setCustomWords([
      { word: 'abuabu', lang: 'id', addedAt: 1 },
      { word: 'abu', lang: 'id', addedAt: 2 }, // sudah ada di dataset bawaan
    ]);
    expect(res).toEqual({ inserted: 1, skippedDuplicates: 1 });
    const r = e.search(q('ab'));
    expect(r.words.sort()).toEqual(['abu', 'abuabu']);
    expect(r.kinds[r.words.indexOf('abuabu')]).toBe(4);
  });

  it('lookup menemukan kata menurut kunci pada bahasa aktif saja', () => {
    const e = makeEngine(ID, EN);
    expect(e.lookup(['Absolute'], ['en'])[0]?.[0]?.word).toBe('absolute');
    expect(e.lookup(['absolute'], ['id'])[0]).toEqual([]);
    expect(e.lookup(['hotel'], ['id', 'en'])[0]).toHaveLength(2);
  });

  it('konfigurasi bawaan mengaktifkan kedua bahasa', () => {
    expect(DEFAULT_ENGINE_CONFIG.languages).toEqual(['id', 'en']);
  });
});
