/**
 * Normalisasi kata.
 *
 * Prinsip: ejaan asli dari dataset tidak diubah. Bentuk "kunci" (key) hanya dipakai untuk
 * pencarian awalan dan pencocokan riwayat, yaitu huruf a-z kecil tanpa diakritik, tanda hubung,
 * apostrof, atau spasi. Fungsi foldKey harus tetap identik dengan foldKey di
 * tools/dataset/build.mjs agar urutan file dataset sesuai dengan urutan kunci di runtime.
 */

const DIACRITICS = /\p{M}+/gu;
const NON_LETTER = /[^a-z]/g;

/** Kunci pencarian: NFD, buang diakritik, huruf kecil, hanya a-z. */
export function foldKey(input: string): string {
  // Jalur cepat untuk kata ASCII murni yang umum (hampir semua isi dataset).
  let ascii = true;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (!((c >= 97 && c <= 122) || c === 45)) {
      ascii = false;
      break;
    }
  }
  if (ascii) return input.indexOf('-') === -1 ? input : input.replace(/-/g, '');
  return input.normalize('NFD').replace(DIACRITICS, '').toLowerCase().replace(NON_LETTER, '');
}

/** Normalisasi awalan yang diketik atau diucapkan pengguna. */
export function normalizePrefix(input: string): string {
  return foldKey(input);
}

/** N huruf terakhir dari kunci. Bila kunci lebih pendek dari N, seluruh kunci dipakai. */
export function tailOf(key: string, n: number): string {
  if (n <= 0) return '';
  return key.length <= n ? key : key.slice(key.length - n);
}

/**
 * Memecah ejaan tampilan menjadi bagian depan dan N huruf terakhir (hanya menghitung huruf,
 * sehingga tanda hubung dan apostrof tidak ikut terhitung). Dipakai untuk menyorot akhiran.
 */
export function splitDisplayTail(display: string, n: number): [head: string, tail: string] {
  if (n <= 0) return [display, ''];
  let letters = 0;
  for (let i = display.length - 1; i >= 0; i--) {
    if (foldKey(display[i] ?? '').length === 1) {
      letters++;
      if (letters === n) return [display.slice(0, i), display.slice(i)];
    }
  }
  return ['', display];
}

export type WordValidation =
  | { ok: true; word: string; key: string }
  | { ok: false; reason: string };

const WORD_SHAPE = /^[\p{L}]+(?:[-'’][\p{L}]+)*$/u;

/**
 * Validasi satu kata untuk kata khusus atau impor. Ejaan asli dipertahankan (hanya dirapikan
 * spasinya dan apostrof tipografis diseragamkan), bukan diubah menjadi bentuk lain.
 */
export function validateWord(raw: string): WordValidation {
  const word = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!word) return { ok: false, reason: 'Kosong' };
  if (word.length > 40) return { ok: false, reason: 'Lebih dari 40 karakter' };
  if (/\s/.test(word)) return { ok: false, reason: 'Mengandung spasi (gunakan satu kata)' };
  if (!WORD_SHAPE.test(word)) {
    return { ok: false, reason: 'Hanya huruf, tanda hubung, dan apostrof yang diizinkan' };
  }
  const key = foldKey(word);
  if (key.length < 2) return { ok: false, reason: 'Minimal 2 huruf' };
  return { ok: true, word, key };
}
