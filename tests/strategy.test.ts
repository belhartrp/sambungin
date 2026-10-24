import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY_LABEL,
  difficultyOf,
  endingScore,
  explain,
  isScoring,
  lengthScore,
  scoreCandidate,
  validityScore,
} from '@/lib/strategy';
import { makeEngine, strategy } from './helpers';

const facts = (continuation: number | null, over = {}) => ({
  continuation,
  tier: 1,
  kind: 'd' as const,
  length: 6,
  ...over,
});

describe('komponen skor', () => {
  it('endingScore turun monoton dan buntu bernilai 1', () => {
    expect(endingScore(0)).toBe(1);
    let prev = 1;
    for (const c of [1, 2, 5, 20, 100, 1000]) {
      const s = endingScore(c);
      expect(s).toBeLessThan(prev);
      prev = s;
    }
  });

  it('validitas: tingkat lebih jarang dan kata tidak baku bernilai lebih rendah', () => {
    expect(validityScore(1, 'd')).toBeGreaterThan(validityScore(2, 'd'));
    expect(validityScore(2, 'd')).toBeGreaterThan(validityScore(3, 'd'));
    expect(validityScore(1, 'p')).toBeLessThan(validityScore(1, 'd'));
  });

  it('lengthScore mengikuti preferensi panjang atau pendek', () => {
    expect(lengthScore(12, 'longer')).toBeGreaterThan(lengthScore(4, 'longer'));
    expect(lengthScore(12, 'shorter')).toBeLessThan(lengthScore(4, 'shorter'));
  });
});

describe('skor kandidat', () => {
  it('null bila strategi dimatikan', () => {
    expect(scoreCandidate(facts(0), strategy({ enabled: false }))).toBeNull();
    expect(isScoring(strategy({ enabled: false }))).toBe(false);
  });

  it('null bila tidak ada komponen aktif', () => {
    const none = strategy({ prioritizeHardEndings: false, preferValidWords: false, considerLength: false });
    expect(scoreCandidate(facts(0), none)).toBeNull();
  });

  it('akhiran dengan pilihan lebih sedikit bernilai lebih tinggi', () => {
    const o = strategy();
    expect(scoreCandidate(facts(0), o)!).toBeGreaterThan(scoreCandidate(facts(3), o)!);
    expect(scoreCandidate(facts(3), o)!).toBeGreaterThan(scoreCandidate(facts(300), o)!);
  });

  it('skor berada pada rentang 0 sampai 100', () => {
    for (const c of [0, 1, 50, 100000]) {
      const s = scoreCandidate(facts(c), strategy({ considerLength: true }))!;
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });
});

describe('difficultyOf dan penjelasan', () => {
  it('memetakan jumlah kelanjutan ke tingkat kesulitan', () => {
    expect(difficultyOf(0)).toBe('buntu');
    expect(difficultyOf(3)).toBe('sangat-sulit');
    expect(difficultyOf(20)).toBe('sulit');
    expect(difficultyOf(150)).toBe('sedang');
    expect(difficultyOf(151)).toBe('mudah');
    expect(DIFFICULTY_LABEL.buntu).toBe('Buntu');
  });

  it('alasan memuat angka nyata dari hitungan', () => {
    expect(explain({ ...facts(3), tail: 'y' })[0]).toBe('Pilihan lanjutan hanya 3 kata.');
    expect(explain({ ...facts(0), tail: 'x' })[0]).toContain('Tidak ada kata lanjutan');
    expect(explain({ ...facts(1), tail: 'q' })[0]).toContain('hanya 1 kata');
    expect(explain({ ...facts(1500), tail: 'a' })[0]).toContain('1.500');
  });

  it('memberi peringatan untuk kata jarang dan tidak baku', () => {
    expect(explain({ ...facts(2, { tier: 3 }), tail: 'x' }).join(' ')).toContain('jarang');
    expect(explain({ ...facts(2, { kind: 'p' }), tail: 'x' }).join(' ')).toContain('tidak baku');
  });
});

describe('urutan rekomendasi pada mesin', () => {
  // abe -> "e": 3 kata (enak, edan, emas); abu -> "u": 1 kata (ular); abx -> "x": 0 (buntu).
  const ID = ['abe', 'abu', 'abx', 'enak', 'edan', 'emas', 'ular'];
  const prefixQ = (s = strategy()) => ({ prefix: 'ab', tailLength: 1, strategy: s });

  it('mengurutkan dari akhiran tersulit (buntu) ke termudah', () => {
    const r = makeEngine(ID, []).search(prefixQ());
    expect(r.top.map((i) => r.words[i])).toEqual(['abx', 'abu', 'abe']);
    const scores = r.top.map((i) => r.scores[i]!);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('mematikan strategi menghapus skor, rekomendasi, dan mengembalikan urutan alfabetis', () => {
    const r = makeEngine(ID, []).search(prefixQ(strategy({ enabled: false })));
    expect(r.scored).toBe(false);
    expect(r.top).toEqual([]);
    expect(r.words.map((_, i) => r.words[r.order[i]!])).toEqual(['abe', 'abu', 'abx']);
    expect(Number.isNaN(r.scores[0])).toBe(true);
  });

  it('mematikan prioritas akhiran sulit mengubah urutan hasil', () => {
    const base = makeEngine(ID, []).search(prefixQ());
    const off = makeEngine(ID, []).search(
      prefixQ(strategy({ prioritizeHardEndings: false, showContinuation: false })),
    );
    expect(off.counted).toBe(false);
    expect(off.top.map((i) => off.words[i])).not.toEqual(base.top.map((i) => base.words[i]));
  });

  it('showContinuation menampilkan jumlah tanpa memengaruhi skor bila strategi mati', () => {
    const r = makeEngine(ID, []).search(prefixQ(strategy({ enabled: false, showContinuation: true })));
    expect(r.counted).toBe(true);
    expect(r.cont[r.words.indexOf('abe')]).toBe(3);
    expect(r.scored).toBe(false);
  });

  it('showContinuation mati dan strategi mati tidak menghitung kelanjutan sama sekali', () => {
    const r = makeEngine(ID, []).search(prefixQ(strategy({ enabled: false, showContinuation: false })));
    expect(r.counted).toBe(false);
    expect([...r.cont].every((c) => c === -1)).toBe(true);
  });

  it('pertimbangan panjang kata mengubah skor sesuai arah', () => {
    const e = makeEngine(['abuku', 'abuk'], ['enak']);
    const only = { prioritizeHardEndings: false, preferValidWords: false, considerLength: true };
    const longer = e.search({ prefix: 'ab', tailLength: 1, strategy: strategy({ ...only, lengthPreference: 'longer' }) });
    const shorter = e.search({ prefix: 'ab', tailLength: 1, strategy: strategy({ ...only, lengthPreference: 'shorter' }) });
    expect(longer.words[longer.top[0]!]).toBe('abuku');
    expect(shorter.words[shorter.top[0]!]).toBe('abuk');
  });

  it('utamakan kata valid memajukan kata umum dibanding kata jarang', () => {
    const e = makeEngine(['abaa:d3', 'abab'], []);
    const only = { prioritizeHardEndings: false, considerLength: false, showContinuation: false };
    const on = e.search({ prefix: 'ab', tailLength: 1, strategy: strategy({ ...only, preferValidWords: true }) });
    expect(on.words[on.top[0]!]).toBe('abab');
  });

  it('rekomendasi tidak mengulang kunci yang sama dari dua bahasa', () => {
    const e = makeEngine(['hotel'], ['hotel']);
    const r = e.search({ prefix: 'hot', tailLength: 1, strategy: strategy() });
    expect(r.rowCount).toBe(2);
    expect(r.top).toHaveLength(1);
  });
});

describe('pemutus seri skor', () => {
  it('skor seri: kata lebih pendek didahulukan (bukan sekadar alfabetis)', () => {
    // Semua berakhiran "x" (buntu) sehingga skor sama persis.
    const e = makeEngine(['abaacx', 'abax', 'abaabbcx'], []);
    const r = e.search({ prefix: 'ab', tailLength: 1, strategy: strategy() });
    expect(new Set(r.top.map((i) => r.scores[i])).size).toBe(1);
    expect(r.top.map((i) => r.words[i])).toEqual(['abax', 'abaacx', 'abaabbcx']);
  });

  it('bila pengguna meminta kata panjang, seri memajukan kata lebih panjang', () => {
    const e = makeEngine(['abaacx', 'abax', 'abaabbcx'], []);
    const only = { prioritizeHardEndings: true, considerLength: true, lengthPreference: 'longer' as const };
    const r = e.search({ prefix: 'ab', tailLength: 1, strategy: strategy(only) });
    expect(r.words[r.top[0]!]).toBe('abaabbcx');
  });
});
