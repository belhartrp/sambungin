import { describe, expect, it } from 'vitest';
import { addUsed, removeUsed, sanitizeUsedList, toRefs, undoLast } from '@/lib/history';
import type { UsedWord } from '@/lib/types';

const add = (list: UsedWord[], word: string, lang: 'id' | 'en', across = true, now = 1000) =>
  addUsed(list, { word, lang, via: 'manual', inDataset: true, now }, across);

describe('penandaan kata', () => {
  it('menambahkan kata dengan kunci ternormalisasi dan ejaan asli', () => {
    const { list, added } = add([], 'Café', 'en');
    expect(list).toHaveLength(1);
    expect(added).toMatchObject({ key: 'cafe', word: 'Café', lang: 'en', inDataset: true });
  });

  it('menolak duplikat (huruf besar/kecil dan tanda hubung diabaikan)', () => {
    const a = add([], 'kupu-kupu', 'id');
    const b = add(a.list, 'KupuKupu', 'id');
    expect(b.added).toBeNull();
    expect(b.duplicate?.word).toBe('kupu-kupu');
    expect(b.list).toHaveLength(1);
  });

  it('kebijakan lintas bahasa menolak kata sama di bahasa lain; per bahasa mengizinkan', () => {
    const a = add([], 'hotel', 'id');
    expect(add(a.list, 'hotel', 'en', true).added).toBeNull();
    expect(add(a.list, 'hotel', 'en', false).added).not.toBeNull();
  });

  it('mengabaikan kata kosong', () => {
    expect(add([], '---', 'id').added).toBeNull();
  });
});

describe('undo, hapus, dan reset', () => {
  it('undo membatalkan penandaan terakhir saja', () => {
    let l = add([], 'abu', 'id', true, 1).list;
    l = add(l, 'enak', 'id', true, 2).list;
    const { list, removed } = undoLast(l);
    expect(removed?.word).toBe('enak');
    expect(list.map((u) => u.word)).toEqual(['abu']);
  });

  it('undo pada riwayat kosong tidak melakukan apa pun', () => {
    expect(undoLast([])).toEqual({ list: [], removed: null });
  });

  it('menghapus satu entri menurut id', () => {
    const l = add(add([], 'abu', 'id').list, 'enak', 'id').list;
    const { list, removed } = removeUsed(l, l[0]!.id);
    expect(removed?.word).toBe('abu');
    expect(list).toHaveLength(1);
    expect(removeUsed(list, 'tidak-ada').removed).toBeNull();
  });

  it('toRefs hanya meneruskan kunci dan bahasa ke mesin', () => {
    expect(toRefs(add([], 'abu', 'id').list)).toEqual([{ key: 'abu', lang: 'id' }]);
  });
});

describe('sanitizeUsedList', () => {
  it('membuang entri rusak dan mengurutkan kronologis', () => {
    const out = sanitizeUsedList([
      { id: 'b', word: 'enak', lang: 'id', at: 2 },
      { id: 'a', word: 'abu', lang: 'id', at: 1, via: 'voice' },
      { id: 'x', word: 'salah', lang: 'fr', at: 3 },
      null,
      'bukan objek',
      { id: 'z', word: '123', lang: 'id', at: 4 },
    ]);
    expect(out.map((u) => u.word)).toEqual(['abu', 'enak']);
    expect(out[0]!.via).toBe('voice');
    expect(sanitizeUsedList('rusak')).toEqual([]);
  });
});
