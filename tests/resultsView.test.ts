import { describe, expect, it } from 'vitest';
import { buildTables, filterRows, rowView, sortRows } from '@/lib/resultsView';
import { splitDisplayTail } from '@/lib/normalize';
import { makeEngine, strategy } from './helpers';

const e = () => makeEngine(['abadi', 'abu', 'abx', 'enak'], ['absolute', 'abstract', 'easy']);
const result = () => e().search({ prefix: 'ab', tailLength: 1, strategy: strategy() });

describe('satu tabel atau tabel terpisah', () => {
  it('satu tabel memuat seluruh hasil dari kedua bahasa', () => {
    const r = result();
    const tables = buildTables(r, 'single', ['id', 'en']);
    expect(tables).toHaveLength(1);
    expect(tables[0]!.id).toBe('all');
    expect(tables[0]!.rows).toHaveLength(r.rowCount);
  });

  it('tabel terpisah membagi hasil per bahasa dengan jumlah masing-masing', () => {
    const r = result();
    const tables = buildTables(r, 'split', ['id', 'en']);
    expect(tables.map((t) => t.id)).toEqual(['id', 'en']);
    expect(tables[0]!.rows.every((i) => r.langs[i] === 0)).toBe(true);
    expect(tables[1]!.rows.every((i) => r.langs[i] === 1)).toBe(true);
    expect(tables[0]!.rows.length + tables[1]!.rows.length).toBe(r.rowCount);
  });

  it('satu bahasa aktif selalu satu tabel, tanpa panel kosong', () => {
    const r = makeEngine(['abu'], ['abs'], { languages: ['id'] }).search({
      prefix: 'ab', tailLength: 1, strategy: strategy(),
    });
    const tables = buildTables(r, 'split', ['id']);
    expect(tables).toHaveLength(1);
    expect(tables[0]!.title).toBe('Kosakata Indonesia');
  });

  it('pengaturan tampilan tidak mengubah hasil algoritma', () => {
    const r = result();
    const a = buildTables(r, 'single', ['id', 'en'])[0]!.rows;
    const b = buildTables(r, 'split', ['id', 'en']).flatMap((t) => t.rows);
    expect([...a].sort((x, y) => x - y)).toEqual([...b].sort((x, y) => x - y));
  });
});

describe('urutan dan saringan', () => {
  it('mengurutkan menurut kata, panjang, dan kelanjutan', () => {
    const r = result();
    const rows = Array.from(r.order);
    const byWord = sortRows(r, rows, 'word', 'asc').map((i) => r.words[i]);
    expect(byWord).toEqual([...byWord].sort());
    const byLen = sortRows(r, rows, 'length', 'desc').map((i) => r.words[i]!.length);
    expect(byLen).toEqual([...byLen].sort((a, b) => b - a));
    const byCont = sortRows(r, rows, 'continuation', 'asc').map((i) => r.cont[i]!);
    expect(byCont).toEqual([...byCont].sort((a, b) => a - b));
  });

  it('nilai yang belum dihitung selalu berada di akhir', () => {
    const r = makeEngine(['abu'], [], {}).search({
      prefix: 'ab', tailLength: 1, strategy: strategy({ enabled: false, showContinuation: false }),
    });
    expect(sortRows(r, [0], 'score', 'desc')).toEqual([0]);
  });

  it('saringan hasil mencocokkan bagian kata tanpa memengaruhi hasil asli', () => {
    const r = result();
    const rows = Array.from(r.order);
    expect(filterRows(r, rows, 'ract').map((i) => r.words[i])).toEqual(['abstract']);
    expect(filterRows(r, rows, '')).toBe(rows);
  });

  it('rowView menandai rekomendasi dan memberi label kesulitan', () => {
    const r = result();
    const top = rowView(r, r.top[0]!);
    expect(top.recommended).toBe(true);
    expect(top.difficulty).toBe('buntu');
    expect(top.score).not.toBeNull();
  });
});

describe('penyorotan akhiran', () => {
  it('memisahkan N huruf terakhir tanpa menghitung tanda hubung', () => {
    expect(splitDisplayTail('absolute', 1)).toEqual(['absolut', 'e']);
    expect(splitDisplayTail('paut-memaut', 2)).toEqual(['paut-mema', 'ut']);
    expect(splitDisplayTail('kupu-kupu', 3)).toEqual(['kupu-k', 'upu']);
    expect(splitDisplayTail('ab', 5)).toEqual(['', 'ab']);
  });
});
