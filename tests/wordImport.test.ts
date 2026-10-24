import { describe, expect, it } from 'vitest';
import { validateWord } from '@/lib/normalize';
import { MAX_IMPORT_BYTES, MAX_IMPORT_WORDS, checkFileMeta, parseWordFile } from '@/lib/wordImport';

describe('validateWord', () => {
  it('menerima kata dengan tanda hubung, apostrof, dan diakritik tanpa mengubah ejaan', () => {
    expect(validateWord('kupu-kupu')).toMatchObject({ ok: true, word: 'kupu-kupu', key: 'kupukupu' });
    expect(validateWord("don't")).toMatchObject({ ok: true, key: 'dont' });
    expect(validateWord('Café')).toMatchObject({ ok: true, word: 'Café', key: 'cafe' });
  });

  it('menolak spasi, angka, simbol, HTML, terlalu pendek, dan terlalu panjang', () => {
    for (const bad of ['', 'dua kata', 'abc123', '<script>', 'a', 'x'.repeat(41), '-abc', 'abc-']) {
      expect(validateWord(bad).ok, bad).toBe(false);
    }
  });
});

describe('parseWordFile', () => {
  it('membaca daftar satu kata per baris dengan bahasa bawaan', () => {
    const r = parseWordFile('cuan\nkepo\n', 'id');
    expect(r.valid).toEqual([{ word: 'cuan', lang: 'id' }, { word: 'kepo', lang: 'id' }]);
    expect(r.invalidCount).toBe(0);
  });

  it('membaca CSV kata,bahasa dengan baris judul dan alias bahasa', () => {
    const r = parseWordFile('word,language\ncuan,id\nrizz,English\nbaper,indonesia\n', 'id');
    expect(r.valid).toEqual([
      { word: 'cuan', lang: 'id' }, { word: 'rizz', lang: 'en' }, { word: 'baper', lang: 'id' },
    ]);
  });

  it('beberapa kata dalam satu baris memakai bahasa bawaan', () => {
    expect(parseWordFile('a1, kepo, cuan', 'en').valid.map((w) => w.word)).toEqual(['kepo', 'cuan']);
  });

  it('mendeteksi duplikat di dalam file (kunci dan bahasa sama)', () => {
    const r = parseWordFile('kupu-kupu\nKupuKupu\nkupu-kupu,en\n', 'id');
    expect(r.valid).toHaveLength(2);
    expect(r.duplicatesInFile).toBe(1);
  });

  it('melaporkan baris tidak valid beserta alasan dan nomor baris', () => {
    const r = parseWordFile('baik\n<b>x</b>\nabc123\n', 'id');
    expect(r.valid.map((w) => w.word)).toEqual(['baik']);
    expect(r.invalidCount).toBe(2);
    expect(r.invalid[0]).toMatchObject({ line: 2 });
    expect(r.invalid[0]!.reason).toContain('Hanya huruf');
  });

  it('mengabaikan komentar, baris kosong, BOM, dan akhir baris Windows', () => {
    const r = parseWordFile('\uFEFF# komentar\r\n\r\ncuan\r\n', 'id');
    expect(r.valid).toEqual([{ word: 'cuan', lang: 'id' }]);
  });

  it('membatasi jumlah kata agar indeks tidak membeku', () => {
    const big = Array.from({ length: MAX_IMPORT_WORDS + 5 }, (_, i) => `kata${String.fromCharCode(97 + (i % 26))}${'q'.repeat(1 + (i % 7))}${i.toString(26).replace(/[0-9]/g, 'z')}`).join('\n');
    const r = parseWordFile(big, 'id');
    expect(r.valid.length).toBeLessThanOrEqual(MAX_IMPORT_WORDS);
  });

  it('checkFileMeta menolak file kosong, terlalu besar, dan format tak didukung', () => {
    expect(checkFileMeta({ name: 'a.txt', size: 0 })).toContain('kosong');
    expect(checkFileMeta({ name: 'a.txt', size: MAX_IMPORT_BYTES + 1 })).toContain('besar');
    expect(checkFileMeta({ name: 'a.exe', size: 10 })).toContain('Format');
    expect(checkFileMeta({ name: 'a.csv', size: 10 })).toBeNull();
  });
});
