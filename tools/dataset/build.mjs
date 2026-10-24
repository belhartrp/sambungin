// Pembangun dataset Sambungin.
//
// Keluaran (ke ../../public/data/):
//   id.txt, en.txt   satu entri per baris: "<tampilan>|<kategori><tingkat><sumber>"
//   manifest.json    jumlah kata, sumber, dan lisensi
//
// Kode kategori : d = kamus (kata dasar dan bentuk berimbuhan yang tervalidasi),
//                 p = populer/tidak baku, s = singkatan, n = nama tempat
// Tingkat       : 1 = umum, 2 = lazim, 3 = jarang/luas
// Sumber (bit)  : Indonesia  1 = Hunspell (cspell), 2 = korpus OpenSubtitles, 4 = kurasi
//                 Inggris    1 = SCOWL, 2 = dwyl english-words, 4 = word-list, 8 = kurasi
//
// Penjelasan keputusan penyaringan ada di DATASET.md.

import fs from 'node:fs';
import path from 'node:path';
import { importTrie, iteratorTrieWords } from 'cspell-trie-lib';
import wordListPath from 'word-list';

const here = import.meta.dirname;
const dwyl = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, 'node_modules/an-array-of-english-words/index.json'), 'utf8'),
);
const outDir = path.resolve(here, '../../public/data');
fs.mkdirSync(outDir, { recursive: true });

// Harus identik dengan foldKey() pada src/lib/normalize.ts.
const foldKey = (w) =>
  w.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z]/g, '');

const KIND_RANK = { d: 0, p: 1, s: 2, n: 3 };

/** Peta kunci -> entri. Bila kunci sama, kategori berperingkat lebih rendah menang dan sumber digabung. */
class Bucket {
  constructor() {
    this.map = new Map();
  }
  add(display, kind, tier, src) {
    const key = foldKey(display);
    if (!key) return;
    const cur = this.map.get(key);
    if (!cur) {
      this.map.set(key, { display, kind, tier, src });
      return;
    }
    cur.src |= src;
    if (KIND_RANK[kind] < KIND_RANK[cur.kind]) {
      cur.kind = kind;
      cur.display = display;
    }
    if (tier < cur.tier) cur.tier = tier;
  }
  get size() {
    return this.map.size;
  }
  write(file) {
    const rows = [...this.map.entries()].sort((a, b) =>
      a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
    );
    const lines = rows.map(([, e]) => `${e.display}|${e.kind}${e.tier}${e.src.toString(16)}`);
    fs.writeFileSync(file, lines.join('\n') + '\n');
    const stats = { count: rows.length, byKind: {}, byTier: {} };
    for (const [, e] of rows) {
      stats.byKind[e.kind] = (stats.byKind[e.kind] ?? 0) + 1;
      stats.byTier[e.tier] = (stats.byTier[e.tier] ?? 0) + 1;
    }
    stats.bytes = fs.statSync(file).size;
    return stats;
  }
}

function readCurated(file) {
  const out = [];
  let kind = 'p';
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^\[([a-z])\]$/.exec(line);
    if (m) {
      kind = m[1];
      continue;
    }
    for (const w of line.split(/\s+/)) out.push({ word: w, kind });
  }
  return out;
}

const SUPPORT_MIN = 15;
const hasVowel = (w) => /[aeiou]/.test(w);
const hasTriple = (w) => /(.)\1\1/.test(w);

/* ------------------------------------------------------------------ INDONESIA */

function buildIndonesian() {
  const corpusFile = path.join(here, '.cache/id_full.txt');
  if (!fs.existsSync(corpusFile)) {
    throw new Error('Korpus belum diunduh. Jalankan: npm run fetch');
  }

  // 1. Kamus Hunspell (bentuk hasil ekspansi afiks dari cspell).
  const trieRaw = fs.readFileSync(
    path.join(here, 'node_modules/@cspell/dict-id-id/dict/id-id.trie'),
    'utf8',
  );
  const S = new Set();
  const SHAPE = /^[a-z]+(?:-[a-z]+)*$/;
  let rawCount = 0;
  for (const w of iteratorTrieWords(importTrie(trieRaw.split('\n')))) {
    rawCount++;
    // "~" menandai varian tak-peka-huruf-besar pada trie cspell; "-Nya/-Mu" adalah kata ganti Tuhan.
    const c = w.replace(/^~/, '').toLowerCase();
    if (SHAPE.test(c)) S.add(c);
  }

  // 2. Korpus frekuensi.
  const F = new Map();
  for (const line of fs.readFileSync(corpusFile, 'utf8').split('\n')) {
    const i = line.lastIndexOf(' ');
    if (i > 0) F.set(line.slice(0, i), Number(line.slice(i + 1)));
  }

  // 3. Heuristik "bentuk turunan": apakah kata dapat diperoleh dari kata lain di S
  //    dengan menambahkan awalan/akhiran produktif.
  const PRE = [
    'memper', 'diper', 'keber', 'keter', 'seper', 'penye', 'pember', 'meng', 'meny', 'peng',
    'peny', 'mem', 'men', 'pem', 'pen', 'ber', 'per', 'ter', 'me', 'pe', 'be', 'te', 'di', 'ke', 'se',
  ].sort((a, b) => b.length - a.length);
  const SUF = ['kannya', 'annya', 'inya', 'kan', 'an', 'i', 'nya', 'ku', 'mu', 'lah', 'kah', 'tah', 'pun']
    .sort((a, b) => b.length - a.length);

  const isDerived = (w) => {
    const bases = new Set([w]);
    let frontier = new Set([w]);
    for (let d = 0; d < 3; d++) {
      const next = new Set();
      for (const x of frontier) {
        for (const s of SUF) {
          if (x.endsWith(s) && x.length - s.length >= 3) next.add(x.slice(0, -s.length));
        }
      }
      for (const n of next) bases.add(n);
      frontier = next;
    }
    for (const x of bases) {
      for (const p of PRE) {
        if (x.startsWith(p) && x.length - p.length >= 2) {
          const r = x.slice(p.length);
          if (S.has(r)) return true;
          if ((p === 'meng' || p === 'peng') && S.has('k' + r)) return true;
          if ((p === 'mem' || p === 'pem') && S.has('p' + r)) return true;
          if ((p === 'men' || p === 'pen') && S.has('t' + r)) return true;
          if ((p === 'meny' || p === 'peny') && S.has('s' + r)) return true;
        }
      }
      if (x !== w && S.has(x)) return true;
    }
    return false;
  };

  const stem = (w, s) => (w.endsWith(s) ? w.slice(0, -s.length) : null);
  const isPronounClitic = (w) => {
    if (/-(nya|mu|ku|lah|kah|pun)$/.test(w)) return true; // klitik bertanda hubung
    for (const s of ['nya', 'ku', 'mu']) {
      const st = stem(w, s);
      if (st && st.length >= 3 && S.has(st)) return true; // bukunya, rumahku, hatimu
    }
    return false;
  };
  const isProclitic = (w) => {
    for (const p of ['kau', 'ku']) {
      if (w.startsWith(p) && w.length - p.length >= 3 && S.has(w.slice(p.length))) {
        return (F.get(w) ?? 0) < 30; // kubaca, kaubawa; "kuping" tetap lolos karena sering muncul
      }
    }
    return false;
  };

  // Deteksi bentuk singkatan (mis. "abg", "abk"): kamus Hunspell memuat singkatan KBBI, tetapi
  // permainan sambung kata umumnya tidak menerimanya. Singkatan memuat gugus konsonan yang
  // hampir tidak pernah muncul pada kata umum. Gugus yang sah diturunkan dari data itu sendiri:
  // dihitung dari kata sering muncul (>= 40 kali di korpus) yang panjangnya > 5 huruf.
  const runsOf = (flat) => flat.match(/[^aeiou]{2,}/g) ?? [];
  const support = new Map();
  for (const w of S) {
    const flat = w.replace(/-/g, '');
    if (flat.length <= 5 || (F.get(w) ?? 0) < 40) continue;
    for (const r of new Set(runsOf(flat))) support.set(r, (support.get(r) ?? 0) + 1);
  }
  // Hanya kata pendek dengan paling banyak satu vokal: kata sah bersuku dua ("abdi", "input")
  // hampir pasti bukan singkatan, sehingga tidak ikut dicurigai.
  const vowelCount = (flat) => (flat.match(/[aeiou]/g) ?? []).length;
  // Kata serapan sah berkonsonan beruntun yang teramati salah terdeteksi saat audit.
  const NOT_ABBREVIATION = new Set([
    'lift', 'golf', 'flek', 'flaks', 'hymne', 'hertz', 'knot', 'silt', 'swap', 'wrang', 'dzat', 'fohn', 'henry',
  ]);
  const looksLikeAbbreviation = (flat) =>
    !NOT_ABBREVIATION.has(flat) &&
    flat.length <= 5 && vowelCount(flat) <= 1 && runsOf(flat).some((r) => (support.get(r) ?? 0) < SUPPORT_MIN);

  const bucket = new Bucket();
  const stat = { abbreviations: 0, hunspellRaw: rawCount, hunspellClean: S.size, roots: 0, derivedKept: 0, derivedDropped: 0, rejected: 0 };

  for (const w of S) {
    const flat = w.replace(/-/g, '');
    if (flat.length < 2 || flat.length > 24 || !hasVowel(flat) || hasTriple(flat)) {
      stat.rejected++;
      continue;
    }
    if (isPronounClitic(w) || isProclitic(w)) {
      stat.rejected++;
      continue;
    }
    const count = F.get(w) ?? 0;
    const tier = count >= 40 ? 1 : count >= 2 ? 2 : 3;
    const src = 1 | (count >= 1 ? 2 : 0);
    // Heuristik morfologi dipakai HANYA untuk menyaring, bukan sebagai label kategori:
    // "mak"+an ("makan") dan "abad"+i ("abadi") kebetulan sama-sama kata valid, sehingga
    // pemisahan akar/turunan tidak cukup andal untuk ditampilkan ke pengguna.
    if (looksLikeAbbreviation(flat)) {
      stat.abbreviations++;
      bucket.add(w, 's', Math.max(tier, 2), src);
    } else if (!isDerived(w)) {
      stat.roots++;
      bucket.add(w, 'd', tier, src);
    } else if (count >= 1) {
      stat.derivedKept++;
      bucket.add(w, 'd', tier, src);
    } else {
      stat.derivedDropped++;
    }
  }

  // 4. Kurasi manual (pelengkap).
  for (const { word, kind } of readCurated(path.join(here, 'curated/id.txt'))) {
    const count = F.get(word) ?? 0;
    bucket.add(word, kind, 2, 4 | (count >= 1 ? 2 : 0));
  }

  stat.afterMerge = bucket.size;
  return { bucket, stat };
}

/* -------------------------------------------------------------------- INGGRIS */

function buildEnglish() {
  const scowlDir = path.join(here, 'node_modules/wordlist-english');
  const tierOf = { 10: 1, 20: 1, 35: 1, 40: 2, 50: 2, 55: 2, 60: 2, 70: 3 };
  const dialects = ['english', 'american', 'british', 'canadian', 'australian'];

  const bucket = new Bucket();
  const stat = { scowlRead: 0, scowlRejected: 0, twoListExtra: 0 };
  const scowlKeys = new Set();

  for (const d of dialects) {
    for (const [size, tier] of Object.entries(tierOf)) {
      const file = path.join(scowlDir, `${d}-words-${size}.json`);
      for (const w of JSON.parse(fs.readFileSync(file, 'utf8'))) {
        stat.scowlRead++;
        if (!/^[a-z\u00e0-\u00ff]+$/.test(w)) {
          stat.scowlRejected++; // huruf kapital (nama/akronim), apostrof, spasi
          continue;
        }
        const key = foldKey(w);
        const flat = key;
        if ((flat.length < 2 && flat !== 'a') || !/[aeiouy]/.test(flat) || hasTriple(flat)) {
          stat.scowlRejected++;
          continue;
        }
        scowlKeys.add(key);
        bucket.add(w, 'd', tier, 1);
      }
    }
  }

  // Kata yang disepakati dua daftar lain (dwyl & word-list) tetapi tidak ada di SCOWL -> tingkat 3.
  const W = new Set(
    fs.readFileSync(wordListPath, 'utf8').split('\n').map((x) => x.trim()).filter(Boolean),
  );
  for (const w of dwyl) {
    if (!/^[a-z]+$/.test(w) || w.length < 3) continue;
    if (!W.has(w) || scowlKeys.has(w)) continue;
    if (!/[aeiouy]/.test(w) || hasTriple(w)) continue;
    stat.twoListExtra++;
    bucket.add(w, 'd', 3, 2 | 4);
  }
  // Sumber dwyl/word-list pada kata SCOWL (untuk transparansi sumber).
  const dwylSet = new Set(dwyl);
  for (const [key, e] of bucket.map) {
    if (dwylSet.has(key)) e.src |= 2;
    if (W.has(key)) e.src |= 4;
  }

  for (const { word, kind } of readCurated(path.join(here, 'curated/en.txt'))) {
    bucket.add(word, kind, 2, 8);
  }

  stat.afterMerge = bucket.size;
  return { bucket, stat };
}

/* ----------------------------------------------------------------------- MAIN */

const id = buildIndonesian();
const en = buildEnglish();
const idStats = { ...id.stat, ...id.bucket.write(path.join(outDir, 'id.txt')) };
const enStats = { ...en.stat, ...en.bucket.write(path.join(outDir, 'en.txt')) };

const manifest = {
  version: new Date().toISOString().slice(0, 10),
  format: 'display|<kategori><tingkat><sumber-hex>',
  languages: {
    id: { file: 'id.txt', ...idStats },
    en: { file: 'en.txt', ...enStats },
  },
  sources: [
    {
      lang: 'id', bit: 1, name: 'Kamus Indonesia (Hunspell id_ID) via @cspell/dict-id-id 1.0.9',
      license: 'LGPL-3.0-only', url: 'https://github.com/streetsidesoftware/cspell-dicts/tree/main/dictionaries/id_ID',
      usage: 'Akar kata dan bentuk berimbuhan (setelah disaring dengan korpus).',
    },
    {
      lang: 'id', bit: 2, name: 'FrequencyWords 2018 (OpenSubtitles), hermitdave',
      license: 'CC-BY-SA-4.0 (konten), MIT (kode)', url: 'https://github.com/hermitdave/FrequencyWords',
      usage: 'Hanya untuk memverifikasi bahwa bentuk berimbuhan benar-benar dipakai dan menentukan tingkat frekuensi.',
    },
    {
      lang: 'id', bit: 4, name: 'Daftar kurasi Sambungin (id)', license: 'CC0-1.0',
      url: 'tools/dataset/curated/id.txt', usage: 'Kata percakapan, singkatan, dan nama tempat.',
    },
    {
      lang: 'en', bit: 1, name: 'SCOWL via wordlist-english 1.2.1', license: 'MIT-style (lihat Copyright SCOWL)',
      url: 'http://wordlist.aspell.net/', usage: 'Kosakata Inggris bertingkat frekuensi (tingkat 10 sampai 70).',
    },
    {
      lang: 'en', bit: 2, name: 'dwyl/english-words via an-array-of-english-words 2.0.0', license: 'Unlicense',
      url: 'https://github.com/dwyl/english-words', usage: 'Verifikasi silang dan kata jarang.',
    },
    {
      lang: 'en', bit: 4, name: 'word-list 4.1.0 (sindresorhus)', license: 'MIT',
      url: 'https://github.com/sindresorhus/word-list', usage: 'Verifikasi silang dan kata jarang.',
    },
    {
      lang: 'en', bit: 8, name: 'Daftar kurasi Sambungin (en)', license: 'CC0-1.0',
      url: 'tools/dataset/curated/en.txt', usage: 'Istilah populer dan nama tempat.',
    },
  ],
};
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log('Indonesia:', idStats);
console.log('Inggris  :', enStats);
