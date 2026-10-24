// Mengunduh korpus frekuensi kata Indonesia (FrequencyWords, hermitdave) ke .cache/.
// Korpus dipakai HANYA untuk menyaring bentuk berimbuhan hasil aturan Hunspell:
// hanya bentuk yang benar-benar muncul di teks nyata yang dipertahankan.
import fs from 'node:fs';
import path from 'node:path';

const URL_ID =
  'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/id/id_full.txt';
const dir = path.join(import.meta.dirname, '.cache');
fs.mkdirSync(dir, { recursive: true });
const out = path.join(dir, 'id_full.txt');

if (fs.existsSync(out) && fs.statSync(out).size > 1_000_000) {
  console.log('Korpus sudah ada:', out);
} else {
  console.log('Mengunduh', URL_ID);
  const res = await fetch(URL_ID);
  if (!res.ok) throw new Error(`Gagal mengunduh korpus: HTTP ${res.status}`);
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log('Tersimpan:', out, fs.statSync(out).size, 'byte');
}
