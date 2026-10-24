# Dataset kosakata Sambungin

Dokumen ini menjelaskan dari mana kata-kata berasal, bagaimana disaring, apa lisensinya, dan apa
keterbatasannya. Isinya dapat diperiksa langsung di aplikasi (tombol dataset di pojok kanan atas).

## Ringkasan

| Bahasa | Jumlah kata | Kamus (d) | Populer (p) | Singkatan (s) | Nama tempat (n) |
|---|---:|---:|---:|---:|---:|
| Indonesia | 59.589 | 59.223 | 105 | 254 | 7 |
| Inggris | 276.720 | 276.595 | 6 | 0 | 119 |

Setiap kata juga memiliki **tingkat** (1 dasar, 2 umum, 3 luas) dan **jejak sumber** (daftar mana saja
yang memuat kata itu). Angka di atas berasal dari `public/data/manifest.json` hasil build terakhir.

## Sumber dan lisensi

| Bahasa | Sumber | Lisensi | Dipakai untuk |
|---|---|---|---|
| Indonesia | Kamus Hunspell `id_ID` lewat paket npm `@cspell/dict-id-id` 1.0.9 | LGPL-3.0-only | Akar kata dan bentuk berimbuhan |
| Indonesia | FrequencyWords 2018 (OpenSubtitles), hermitdave | CC-BY-SA-4.0 (konten), MIT (kode) | Memverifikasi bentuk berimbuhan dan menentukan tingkat frekuensi |
| Indonesia | Daftar kurasi `tools/dataset/curated/id.txt` | CC0-1.0 | Kata percakapan, singkatan, nama tempat |
| Inggris | SCOWL lewat `wordlist-english` 1.2.1 | MIT-style (lihat berkas Copyright SCOWL) | Kosakata bertingkat frekuensi |
| Inggris | dwyl/english-words lewat `an-array-of-english-words` 2.0.0 | Unlicense | Verifikasi silang dan kata jarang |
| Inggris | `word-list` 4.1.0 (sindresorhus) | MIT | Verifikasi silang dan kata jarang |
| Inggris | Daftar kurasi `tools/dataset/curated/en.txt` | CC0-1.0 | Istilah populer dan nama tempat |

Catatan lisensi (bukan nasihat hukum):

- Data digabung dari beberapa lisensi. Untuk penggunaan pribadi tidak ada kendala. Jika Sambungin
  kelak didistribusikan atau dikomersialkan, periksa ketentuan *share-alike* CC-BY-SA 4.0 pada bagian
  yang diturunkan dari korpus FrequencyWords, serta kewajiban atribusi LGPL dan SCOWL.
- **Kamus kata dasar Sastrawi sengaja tidak dipakai.** Kamus itu berasal dari Kateglo dengan lisensi
  CC-BY-NC-SA 3.0 (non-komersial), bukan MIT seperti kode Sastrawi. Anda tetap dapat mengimpornya
  sendiri sebagai kata khusus untuk penggunaan pribadi (lihat bagian impor di bawah); berkas itu
  hanya tersimpan di browser Anda dan tidak ikut didistribusikan bersama aplikasi.

## Format berkas

`public/data/id.txt` dan `public/data/en.txt`, satu entri per baris, **terurut menurut kunci**:

```
<tampilan>|<kategori><tingkat><sumber-hex>
abadi|d13
```

- `tampilan`: ejaan asli (dapat memuat tanda hubung atau diakritik).
- `kategori`: `d` kamus, `p` populer atau tidak baku, `s` singkatan, `n` nama tempat.
- `tingkat`: `1` dasar, `2` umum, `3` luas.
- `sumber`: bitmask heksadesimal. Indonesia: 1 Hunspell, 2 korpus, 4 kurasi. Inggris: 1 SCOWL,
  2 dwyl, 4 word-list, 8 kurasi.

**Kunci** adalah bentuk pencarian: huruf a sampai z kecil tanpa diakritik, tanda hubung, apostrof,
atau spasi (`kupu-kupu` menjadi `kupukupu`). Ejaan asli tidak diubah; kunci hanya dipakai untuk
pencarian awalan dan pencocokan riwayat. Fungsi pembentuknya (`foldKey`) harus identik di
`src/lib/normalize.ts` dan `tools/dataset/build.mjs`; pengujian memeriksa konsistensinya.

## Keputusan penyaringan (dan alasannya)

### Indonesia

Kamus Hunspell mengembangkan aturan afiks menjadi sekitar 1,02 juta bentuk, termasuk bentuk yang bukan
kata, misalnya `penertawanannyakah`. Memakainya mentah akan membuat rekomendasi memuat kata tak valid.
Karena itu:

1. Bentuk dikecilkan dan dibuang bila bukan huruf dan tanda hubung, tanpa vokal, lebih dari 24 huruf,
   atau memuat tiga huruf yang sama berturut-turut.
2. Bentuk klitik dibuang: `-nya`, `-mu`, `-ku` pada kata yang batangnya juga kata (`bukunya`,
   `rumahku`), serta proklitik `ku-` dan `kau-` bila jarang muncul (`kubaca`).
3. Heuristik morfologi memisahkan **akar** (dipertahankan) dari **bentuk turunan** (dipertahankan
   hanya jika muncul sedikitnya satu kali di korpus teks nyata). Heuristik ini hanya dipakai untuk
   menyaring, bukan sebagai label kategori, karena "mak"+an (makan) dan "abad"+i (abadi) kebetulan
   sama-sama kata valid sehingga pemisahan akar dan turunan tidak andal untuk ditampilkan.
4. Tingkat: muncul 40 kali atau lebih di korpus = 1, 2 sampai 39 kali = 2, 0 atau 1 kali = 3.
5. **Singkatan** dideteksi dari gugus konsonan yang hampir tidak pernah muncul pada kata umum
   (misalnya `abg`, `abk`, `dpr`). Gugus yang sah diturunkan dari data itu sendiri, dan hanya kata
   pendek dengan paling banyak satu vokal yang dicurigai. Heuristik ini **tidak sempurna**: pada audit,
   sekitar 7% sampel adalah kata serapan sah (mis. `lift`, `golf`) yang salah ditandai. Kasus yang
   teramati dimasukkan ke daftar pengecualian di `build.mjs`. Kata bertanda singkatan tetap muncul,
   tetapi diberi bobot validitas lebih rendah dan dapat disembunyikan lewat pengaturan.
6. Kata korpus mentah **tidak** dimasukkan: sampelnya didominasi nama tokoh film Barat, bentuk
   klitik, dan salah ketik.

### Inggris

SCOWL (tingkat 10 sampai 70) menjadi inti. Tingkat 10 sampai 35 menjadi tingkat 1, 40 sampai 60
tingkat 2, dan 70 tingkat 3. Kata yang tidak ada di SCOWL tetapi ada di **dua** daftar lain (dwyl dan
word-list) masuk sebagai tingkat 3. Kata yang hanya ada di satu daftar dibuang. Tingkat 3 berisi
sekitar 197 ribu kata setara kamus Scrabble; sebab itu aplikasi memisahkan *cakupan pencarian* dari
*perkiraan kosakata lawan* (lihat README).

SCOWL dan daftar lain tidak memuat nama diri, sehingga nama tempat hanya berasal dari daftar kurasi.

## Keterbatasan yang jujur

- **Cakupan Indonesia lebih kecil daripada Inggris** (sekitar 59,6 ribu; KBBI memuat sekitar 127 ribu
  entri). Bentuk berimbuhan yang tidak pernah muncul di korpus dan nama orang belum tercakup, mis.
  `ketidakpastian`.
- Korpus berasal dari teks terjemahan film: kata formal atau teknis kurang terwakili pada penentuan
  tingkat.
- Daftar kurasi dibuat manual dan tidak lengkap.
- Tidak ada informasi jenis kata (kata benda, kata kerja, dan seterusnya) karena sumbernya tidak
  menyediakannya.
- Hitungan kelanjutan dan skor strategi **mengikuti dataset ini**, bukan seluruh kosakata lawan.

## Memperbarui dataset

Memerlukan Node 20.9 atau lebih baru dan akses jaringan ke GitHub dan npm.

```bash
npm run dataset:install   # memasang dependensi alat (terpisah dari aplikasi)
npm run dataset:fetch     # mengunduh korpus frekuensi ke tools/dataset/.cache
npm run dataset:build     # menulis public/data/id.txt, en.txt, manifest.json
npm test                  # memeriksa integritas berkas (urutan, kunci unik, jumlah, manifest)
```

Versi dataset (`manifest.json`) dipakai sebagai parameter cache pada URL, sehingga browser mengunduh
ulang otomatis setelah dataset berubah.

## Menambah kosakata

- **Dari aplikasi** (paling mudah): panel Dataset, tab Kata khusus. Tambah satu kata, atau impor berkas
  `.txt`, `.csv`, `.tsv` (maksimal 5 MB dan 100.000 kata). Format: satu kata per baris, atau
  `kata,bahasa` dengan bahasa `id` atau `en`. Kata khusus disimpan di IndexedDB browser dan tidak
  mengubah dataset bawaan; kata yang sudah ada di dataset bawaan ditolak agar tidak terhitung dua kali.
- **Permanen untuk semua pengguna**: tambahkan kata ke `tools/dataset/curated/id.txt` atau `en.txt`
  (format ada di komentar berkas), lalu jalankan `npm run dataset:build`.
