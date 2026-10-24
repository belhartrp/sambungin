// Uji end-to-end Sambungin terhadap build produksi (lihat README, bagian Pengujian).
// Pengenalan suara DITIRU, karena lingkungan uji tidak punya mikrofon.
//   BASE           alamat aplikasi (bawaan http://localhost:3000)
//   CHROMIUM_PATH  jalur Chromium/Chrome (bawaan: Chromium milik Playwright)
//   SHOTS_DIR      folder tangkapan layar (bawaan e2e/shots)
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const SHOTS = process.env.SHOTS_DIR ?? 'e2e/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
await context.addInitScript(() => {
  class FakeSR {
    constructor() {
      this.lang = ''; this.continuous = false; this.interimResults = false; this.maxAlternatives = 1;
      this.starts = 0; this.onstart = null; this.onend = null; this.onerror = null; this.onresult = null;
      window.__sr = this;
    }
    start() { this.starts++; setTimeout(() => this.onstart?.(), 10); }
    stop() { setTimeout(() => this.onend?.(), 10); }
    abort() { this.stop(); }
    emit(list, resultIndex = 0) {
      const results = list.map((r) => {
        const o = { isFinal: r.isFinal, length: r.alts.length };
        r.alts.forEach(([transcript, confidence], i) => (o[i] = { transcript, confidence }));
        return o;
      });
      results.length = results.length;
      this.onresult?.({ resultIndex, results });
    }
  }
  window.webkitSpeechRecognition = FakeSR;
  window.SpeechRecognition = FakeSR; // Chromium modern memakai nama tanpa prefiks
});

const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Dataset siap/ }).waitFor({ timeout: 30000 });
check('dataset siap di header', true, await page.getByRole('button', { name: /Dataset siap/ }).getAttribute('aria-label'));

// Mesin berjalan di Web Worker?
await page.getByRole('button', { name: /Buka panel dataset/ }).click();
const workerText = await page.getByText(/Mesin berjalan di/).innerText();
check('mesin berjalan di Web Worker', /Web Worker/.test(workerText), workerText.slice(0, 60));
const dlg = page.getByRole('dialog', { name: 'Dataset kosakata' });
await dlg.getByText('Kosakata Indonesia', { exact: true }).waitFor({ timeout: 8000 }).then(
  () => check('panel dataset menampilkan jumlah kata per bahasa', true),
  () => check('panel dataset menampilkan jumlah kata per bahasa', false, 'kartu statistik tidak muncul'),
);
const idCount = await dlg.locator('p.tabular').first().innerText().catch(() => '');
check('jumlah kata Indonesia terbaca', /^\d{2}\.\d{3}$/.test(idCount), idCount);
await page.screenshot({ path: `${SHOTS}/01-dataset.png` });
await page.keyboard.press('Escape');

// Pencarian ketik
const input = page.getByRole('textbox', { name: 'Awalan' });
await input.fill('ab');
await page.getByRole('table').first().waitFor({ timeout: 10000 });
const dom = await page.locator('[role=row]').count();
const summary = await page.getByLabel('Ringkasan pencarian').innerText();
const found = Number(summary.match(/Ditemukan\s*([\d.]+)/)?.[1].replace(/\./g, ''));
check('hasil muncul otomatis tanpa tombol cari', dom > 3, `baris DOM=${dom}`);
check('virtualisasi: baris DOM jauh lebih sedikit dari total', found > 500 ? dom < 80 : true, `ditemukan=${found}`);
check('rekomendasi tampil', (await page.getByRole('heading', { name: 'Rekomendasi' }).count()) === 1);
const topCard = await page.locator('#rec-title ~ ol li').first().innerText();
check('kartu rekomendasi menyebut awalan lawan', /Lawan harus mulai dengan/.test(topCard), topCard.replace(/\n/g, ' | ').slice(0, 110));
await page.screenshot({ path: `${SHOTS}/02-desktop-ab.png`, fullPage: false });

// Tabel memuat label bahasa + akhiran + skor
const header = await page.locator('[role=columnheader]').allInnerTexts();
check('kolom tabel sesuai pengaturan', ['Kata', 'Bahasa', 'Akhiran', 'Lanjutan', 'Strategi', 'Skor'].every((h) => header.some((x) => x.includes(h))), header.join(','));

// Tandai dari tombol -> masuk riwayat
const firstWord = (await page.locator('[role=row][aria-rowindex="2"] [role=cell]').first().innerText()).split('\n')[0];
await page.locator('[role=row][aria-rowindex="2"]').getByRole('button', { name: /Tandai/ }).click();
await page.getByText(/Ditandai terpakai/).first().waitFor();
check('tombol tandai mencatat ke riwayat', (await page.getByText('1 kata terpakai').count()) === 1, firstWord);
await page.waitForTimeout(400);
const stillThere = await page.locator('[role=row] [role=cell]:first-child', { hasText: new RegExp('^' + firstWord + '$') }).count();
check('kata terpakai hilang dari hasil', stillThere === 0);
await page.getByRole('button', { name: 'Batalkan penandaan terakhir' }).click();
await page.waitForTimeout(400);
check('undo mengembalikan kata', (await page.getByText('0 kata terpakai').count()) === 1);

// Suara: mikrofon -> interim -> final
const mic = page.getByRole('button', { name: 'Mulai mendengarkan' });
await mic.click();
await page.getByText('Ucapkan sekarang').waitFor();
check('indikator mendengarkan aktif', await page.evaluate(() => window.__sr?.starts === 1), 'recognizer palsu dipakai');
await page.evaluate(() => window.__sr.emit([{ isFinal: false, alts: [['a b', 0]] }]));
check('transkrip sementara tampil', (await page.getByText('“a b”').count()) >= 1);
const before = await input.inputValue();
await page.evaluate(() => window.__sr.emit([{ isFinal: true, alts: [['a be es', 0.93]] }]));
await page.waitForFunction(() => document.querySelector('input[aria-label="Awalan"]')?.value === 'abs');
check('ucapan "a be es" menjadi awalan abs (final)', true, `sebelum=${before}`);
await page.waitForTimeout(300);
const used1 = await page.getByText(/\d+ kata terpakai/).first().innerText();
check('ucapan awalan tidak masuk riwayat', /^0 /.test(used1));

// Mode tandai + suara
await page.getByRole('radio', { name: 'Tandai kata' }).click();
await page.evaluate(() => window.__sr.emit([{ isFinal: true, alts: [['absolute', 0.95]] }]));
await page.getByText(/Ditandai terpakai: “absolute”/).waitFor();
check('suara di mode tandai mencatat kata dari dataset', true);
await page.screenshot({ path: `${SHOTS}/03-after-mark.png` });

// Keyakinan rendah -> konfirmasi
await page.evaluate(() => window.__sr.emit([{ isFinal: true, alts: [['abstract', 0.3]] }]));
await page.getByRole('dialog', { name: 'Pastikan kata yang dimaksud' }).waitFor();
check('keyakinan rendah meminta konfirmasi', (await page.getByText(/\d+ kata terpakai/).first().innerText()).startsWith('1 '));
await page.screenshot({ path: `${SHOTS}/04-confirm.png` });
await page.getByRole('button', { name: 'Batal' }).click();

// Pengaturan: bahasa Indonesia saja -> label bahasa & hasil berubah
await page.getByRole('radio', { name: 'Cari awalan' }).click();
await input.fill('ab');
await page.waitForTimeout(500);
await page.getByRole('radio', { name: 'Indonesia' }).first().click();
await page.waitForTimeout(600);
const idOnly = await page.locator('[role=cell]', { hasText: /^English$/ }).count();
check('bahasa Indonesia: tidak ada baris English', idOnly === 0);

// Pengaturan drawer
await page.getByRole('button', { name: 'Buka pengaturan' }).click();
await page.getByRole('dialog', { name: 'Pengaturan' }).waitFor();
await page.screenshot({ path: `${SHOTS}/05-settings.png` });
const switches = await page.getByRole('switch').count();
check('panel pengaturan memuat banyak kontrol', switches >= 12, `switch=${switches}`);
await page.getByRole('radio', { name: 'Tabel terpisah' }).click();
await page.getByRole('radio', { name: 'Campuran' }).last().click().catch(() => {});
await page.keyboard.press('Escape');

await page.getByRole('radio', { name: 'Campuran' }).first().click();
await page.waitForTimeout(700);
const tables = await page.getByRole('table').count();
check('tabel terpisah: dua tabel pada mode campuran', tables === 2, `tabel=${tables}`);
await page.screenshot({ path: `${SHOTS}/06-split.png` });

// Persistensi: muat ulang
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Dataset siap/ }).waitFor({ timeout: 30000 });
await page.getByRole('radio', { name: 'Campuran' }).first().waitFor();
const stillSplit = await page.getByRole('radio', { name: 'Campuran' }).first().getAttribute('data-state');
check('pengaturan bertahan setelah muat ulang', stillSplit === 'on');
const usedAfter = await page.getByText(/\d+ kata terpakai/).first().innerText();
check('riwayat sesi bertahan setelah muat ulang', /^1 /.test(usedAfter), usedAfter);

// Ponsel
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const mp = await mobile.newPage();
mp.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
await mp.goto(BASE, { waitUntil: 'networkidle' });
await mp.getByRole('button', { name: /Dataset siap/ }).waitFor({ timeout: 30000 });
await mp.getByRole('textbox', { name: 'Awalan' }).fill('ab');
await mp.waitForTimeout(800);
const box = await mp.getByRole('button', { name: /mendengarkan|dukung|dimatikan/ }).first().boundingBox();
check('ponsel: tombol mikrofon berada di bagian bawah layar', !!box && box.y > 844 * 0.55, box ? `y=${Math.round(box.y)}` : 'tidak ada');
const overflowX = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check('ponsel: halaman tidak bergulir ke samping', !overflowX);
await mp.screenshot({ path: `${SHOTS}/07-mobile.png` });

console.log(`\nGalat konsol/halaman: ${errors.length}`);
errors.slice(0, 10).forEach((e) => console.log('  ' + e));
console.log(`\n${results.filter(Boolean).length}/${results.length} pemeriksaan lulus`);
await browser.close();
process.exit(results.every(Boolean) && errors.length === 0 ? 0 : 1);
