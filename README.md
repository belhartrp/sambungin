# Sambungin

*Find the word. Win the round.*

Asisten permainan sambung kata berbasis suara. Anda mengucapkan atau mengetik huruf yang harus
disambungkan, dan Sambungin menampilkan kata yang cocok dari dataset nyata (Indonesia, Inggris, atau
campuran), mengingat kata yang sudah terpakai, dan merekomendasikan kata yang membuat lawan kesulitan
menyambung.

Seluruh pencarian berjalan di browser Anda. Tidak ada backend, autentikasi, atau layanan AI berbayar.

## Fitur

- **Cari awalan** dengan suara atau ketikan. Hasil muncul otomatis tanpa tombol cari.
- **Tandai kata** yang baru dimainkan (suara atau ketikan). Kata terpakai dikecualikan dari rekomendasi
  dan dari hitungan pilihan lawan.
- **Tiga mode bahasa**: Indonesia, English, Campuran (dengan label bahasa pada setiap kata).
- **Dua penyajian hasil**: satu tabel, atau tabel terpisah per bahasa (hanya mengubah tampilan).
- **Strategi menyulitkan lawan**: skor heuristik yang dihitung dari jumlah kata lanjutan yang tersisa.
- **Aturan sambungan** yang dapat diatur: otomatis mengikuti input, atau tetap N huruf terakhir.
- **Riwayat**: undo, hapus satu entri, reset dengan konfirmasi; per sesi atau tersimpan lokal.
- **Panel Dataset**: sumber, lisensi, jumlah, penjelajah kata, kata khusus, dan impor berkas.
- **Pengaturan** terkelompok; setiap kontrol benar-benar mengubah perilaku dan tersimpan di browser.

## Menjalankan

Memerlukan Node 20.9 atau lebih baru.

```bash
npm install
npm run dev        # http://localhost:3000
```

Build produksi:

```bash
npm run build
npm start
```

Skrip lain:

| Perintah | Fungsi |
|---|---|
| `npm test` | Pengujian otomatis (Vitest) |
| `npm run typecheck` | Pemeriksaan TypeScript |
| `npm run lint` | ESLint |
| `npm run e2e` | Uji end-to-end di Chromium (lihat bagian Pengujian) |
| `npm run dataset:install`, `dataset:fetch`, `dataset:build` | Membangun ulang dataset (lihat `DATASET.md`) |

## Deployment ke Vercel

Tidak ada konfigurasi server khusus.

1. Unggah proyek ke repositori GitHub.
2. Di Vercel pilih **Add New, Project**, impor repositorinya. Preset **Next.js** terdeteksi otomatis.
3. Tidak ada variabel lingkungan yang diperlukan. Tekan **Deploy**.

Atau lewat CLI: `npx vercel`.

Catatan:

- Mikrofon di browser hanya berfungsi lewat **HTTPS** (atau `localhost`). Vercel menyediakan HTTPS.
- Berkas dataset (`public/data`, sekitar 4,7 MB) disajikan sebagai berkas statis dengan cache panjang;
  versinya ada pada parameter URL sehingga pembaruan dataset otomatis diunduh ulang.
- `next.config.mjs` mengatur header: `Permissions-Policy` hanya mengizinkan mikrofon untuk origin
  sendiri, ditambah `X-Content-Type-Options` dan `Referrer-Policy`.

## Cara kerja

### Pencarian dan mesin

Dataset dimuat dan diindeks di **Web Worker**, sehingga UI tidak terblokir. Setiap entri adalah
pasangan (kunci, bahasa) pada array terurut. Semua kata berawalan P menempati rentang yang kontigu,
sehingga pencarian awalan dan penghitungan kelanjutan memakai dua pencarian biner dan satu
pengurangan *prefix-sum*, tanpa memindai dataset. Bila Worker tidak tersedia, mesin yang sama berjalan
di thread utama dan panel Dataset menyebutkannya.

### Aturan sambungan

- **Otomatis**: awalan adalah seluruh input; lawan menyambung sepanjang itu juga.
- **Tetap N huruf** (1 sampai 6): awalan adalah N huruf terakhir dari input, sehingga Anda boleh
  langsung mengetik atau mengucapkan kata lawan utuh. Contoh: lawan memainkan `enemy`, N = 1, maka
  awalan Anda adalah `y`.

Pencarian, hitungan kelanjutan, dan rekomendasi memakai panjang yang sama.

### Strategi menyulitkan lawan

Untuk kandidat W dengan akhiran T (N huruf terakhir):

```
continuationCount(W) = jumlah kata valid yang DIMULAI dengan T, belum terpakai, dari bahasa aktif,
                       dikenal pada tingkat kosakata lawan, di luar W sendiri
```

Perhatikan: yang dihitung adalah kata yang *dimulai* dengan akhiran, bukan yang berakhiran itu. W tidak
dihitung sebagai pilihan lawan bagi dirinya sendiri karena ia menjadi terpakai begitu dimainkan.

Skor 0 sampai 100 adalah rata-rata berbobot dari komponen yang **aktif**:

| Komponen | Nilai | Bobot |
|---|---|---:|
| Akhiran sulit | `1 / (1 + ln(1 + c))`; buntu (c = 0) bernilai 1 | 0,70 |
| Kata pasti valid | tingkat 1: 1,0; tingkat 2: 0,8; tingkat 3: 0,55; populer/singkatan: 0,5; nama: 0,6; kata khusus: 0,9 | 0,20 |
| Panjang kata | panjang terhadap batas 14 huruf (lebih panjang atau lebih pendek) | 0,10 |

Bobot dinormalisasi terhadap komponen yang aktif, sehingga mematikan satu opsi benar-benar mengubah
urutan. Bila skor seri, kata yang lebih pendek didahulukan (atau lebih panjang bila Anda memintanya),
lalu urutan alfabetis. Setiap rekomendasi disertai alasan yang dihitung dari angka nyata, misalnya
"Pilihan lanjutan hanya 3 kata."

Dua pengaturan terpisah menjaga skor tetap realistis:

- **Cakupan kata** (dasar, umum, luas): kata yang boleh muncul sebagai kandidat.
- **Perkiraan kosakata lawan** (bawaan: umum): kata yang dihitung sebagai pilihan lawan. Tanpa ini,
  ratusan ribu kata jarang membuat hampir semua akhiran tampak mudah.

Skor **bukan jaminan kemenangan**. Ia hanya menjelaskan seberapa sedikit pilihan yang tersisa
menurut dataset dan perkiraan kosakata lawan.

### Suara

Memakai Web Speech API bawaan browser.

- Dua maksud dipisah tegas: **Cari awalan** (huruf yang harus disambung) dan **Tandai kata** (kata utuh
  yang baru dimainkan). Ucapan di mode awalan tidak pernah masuk riwayat.
- Hasil sementara hanya menjadi pratinjau; pencarian berjalan setelah hasil stabil atau final. Riwayat
  hanya berubah oleh hasil final.
- Ucapan huruf dikenali dalam bentuk `a b s`, `a be es` (Indonesia), atau `ay bee ess` (Inggris).
  Pengenalan nama huruf dapat dimatikan bila Anda mengucapkan awalan utuh seperti "es".
- Perintah suara (dapat dimatikan): "tandai [kata]", "cari [huruf]", "batalkan", "hapus".
- Bila keyakinan pengenalan rendah, kata ada di dua bahasa, atau tidak ada di dataset, aplikasi
  **meminta konfirmasi** alih-alih langsung mengubah riwayat. Penandaan selalu dapat diurungkan.
- Izin mikrofon baru diminta saat Anda menekan tombol mikrofon. Satu instance pengenal dipakai ulang
  sepanjang sesi. Suara tidak direkam atau disimpan oleh Sambungin.

**Keterbatasan yang perlu Anda ketahui:**

- Pengenalan suara andal di **Chrome dan Edge**. Browser lain dapat tidak mendukungnya; aplikasi
  mendeteksi ini, menonaktifkan tombol mikrofon dengan penjelasan, dan input ketik tetap berfungsi penuh.
- Browser hanya mengenali **satu bahasa per sesi suara**. Pada mode Campuran, pilih bahasa suara
  (Indonesia atau English) di Pengaturan. Pencocokan kata pada mode tandai tetap mencari di kedua bahasa.
- Layanan pengenalan suara browser (di Chrome dan Edge, umumnya diproses di server penyedia browser)
  memiliki kebijakan privasinya sendiri.

### Penyimpanan dan privasi

| Data | Tempat | Masa simpan |
|---|---|---|
| Pengaturan | localStorage | Sampai dihapus |
| Riwayat, mode sesi | sessionStorage | Selama tab terbuka (bertahan saat muat ulang) |
| Riwayat, mode lokal | IndexedDB | Sampai dihapus; hanya browser dan perangkat yang sama |
| Kata khusus | IndexedDB | Sampai dihapus; hanya browser dan perangkat yang sama |

Tidak ada data yang dikirim ke server Sambungin. Berkas impor diproses di browser dan divalidasi
(bentuk kata, panjang, duplikat, batas ukuran); isi dataset selalu dirender sebagai teks, bukan HTML.

## Struktur proyek

```
src/
  app/                  halaman Next.js (App Router) dan gaya global
  components/           komponen UI; components/ui = primitif aksesibel (Radix)
  hooks/                useSpeech, useSpeechSupported
  lib/                  logika inti tanpa UI (diuji tanpa browser)
    normalize.ts        kunci pencarian, validasi kata
    lexicon.ts          leksikon kolumnar terurut, penggabungan, pencarian biner
    engine.ts           pencarian awalan, hitungan kelanjutan, lookup, penjelajahan
    strategy.ts         skor heuristik dan penjelasan
    rules.ts            aturan sambungan
    resultsView.ts      tabel (satu atau terpisah), urutan, saringan
    history.ts          operasi riwayat murni
    settings.ts         skema pengaturan dan sanitasi
    storage.ts          localStorage, sessionStorage, IndexedDB
    wordImport.ts       parser dan validator impor
    speech/             parser transkrip dan pengendali Web Speech API
    engineHost.ts       protokol mesin (dipakai Worker dan mode inline)
  workers/              engine.worker.ts
  store/app.ts          state aplikasi (Zustand)
tests/                  pengujian Vitest
e2e/smoke.mjs           uji end-to-end opsional (Playwright)
tools/dataset/          pembangun dataset (dependensi terpisah)
public/data/            dataset, manifest
```

## Pengujian

```bash
npm test
```

Mencakup (160 pengujian): pencarian awalan (`a`, `ab`, tanpa hasil, awalan kosong), filter bahasa,
mode campuran, satu tabel dan tabel terpisah, penandaan dan pengecualian kata terpakai, filter hidup
dan mati, undo dan reset, hitungan kelanjutan (termasuk verifikasi *brute force* pada dataset asli),
urutan skor, pemutus seri, kata duplikat, aturan N huruf, parser suara dan fallback manual, pengendali
suara dengan `SpeechRecognition` tiruan, persistensi pengaturan dan riwayat (IndexedDB), validasi
impor, integritas berkas dataset, dan alur lengkap store sampai mesin.

### Cara menguji algoritma strategi

1. Pengujian unit: `npm test -- tests/strategy.test.ts tests/engine.test.ts`. Leksikon sintetis kecil
   dipakai sehingga jumlah kelanjutan dapat dihitung manual.
2. Pada dataset asli: `tests/dataset.test.ts` membandingkan `continuationCount` dengan penghitungan
   *brute force* atas seluruh leksikon.
3. Di aplikasi: ketik awalan, lalu bandingkan angka "Lanjutan" pada tabel dengan pencarian awalan di
   panel Dataset (tab Jelajah, jenis Awalan, bahasa dan tingkat yang sama). Mengubah pengaturan strategi
   harus mengubah urutan hasil.

### Uji end-to-end (opsional)

`e2e/smoke.mjs` menjalankan 25 pemeriksaan di Chromium sungguhan terhadap build produksi, dengan
pengenalan suara **tiruan** (karena lingkungan uji tidak punya mikrofon).

```bash
npm run build && npm start &              # server di http://localhost:3000
CHROMIUM_PATH=/path/ke/chrome BASE=http://localhost:3000 npm run e2e
```

Tanpa `CHROMIUM_PATH`, Playwright memakai Chromium bawaannya (`npx playwright-core install chromium`).
Perhatikan bahwa Chromium modern memakai `window.SpeechRecognition` tanpa prefiks.

## Keterbatasan

- Kosakata Indonesia (sekitar 59,6 ribu kata) lebih kecil daripada Inggris (sekitar 276,7 ribu) dan
  tidak memuat semua bentuk berimbuhan atau nama orang. Detail di `DATASET.md`.
- Rekomendasi bergantung pada dataset dan perkiraan kosakata lawan. Lawan dapat mengenal kata yang
  tidak ada di dataset.
- Deteksi singkatan bersifat heuristik dan kadang keliru pada kata serapan.
- Pengenalan suara bergantung pada browser (lihat bagian Suara). Sambungin belum diuji dengan
  mikrofon sungguhan di semua browser.

## Lisensi

Kode Sambungin: MIT. Data kosakata memiliki lisensi sumber masing-masing; lihat `DATASET.md`.
