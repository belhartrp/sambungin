'use client';
import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { SearchResult } from '@/lib/engine';
import { foldKey, splitDisplayTail, tailOf } from '@/lib/normalize';
import { rowView, sortRows, type SortColumn, type SortDir } from '@/lib/resultsView';
import type { Settings } from '@/lib/settings';
import { DIFFICULTY_LABEL, formatCount } from '@/lib/strategy';
import { LANGUAGE_LABEL, type KindCode } from '@/lib/types';

const ROW_HEIGHT = 46;

const KIND_BADGE: Partial<Record<KindCode, string>> = {
  p: 'Tidak baku',
  s: 'Singkatan',
  n: 'Nama tempat',
  c: 'Khusus',
};

interface Col {
  id: string;
  label: string;
  width: string;
  sort?: SortColumn;
  align?: 'right';
}

export function ResultTable({
  title,
  result,
  rows,
  settings,
  showLangColumn,
  onMark,
  emptyText,
}: {
  title: string;
  result: SearchResult;
  rows: number[];
  settings: Settings;
  showLangColumn: boolean;
  onMark: (word: string, lang: 'id' | 'en') => void;
  emptyText: string;
}) {
  const [sort, setSort] = useState<{ col: SortColumn; dir: SortDir }>({ col: 'default', dir: 'asc' });
  const scrollRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => sortRows(result, rows, sort.col, sort.dir), [result, rows, sort]);

  const columns = useMemo<Col[]>(() => {
    const c: Col[] = [{ id: 'word', label: 'Kata', width: 'minmax(11rem,1fr)', sort: 'word' }];
    if (showLangColumn) c.push({ id: 'lang', label: 'Bahasa', width: '6rem', sort: 'lang' });
    if (settings.showEnding) c.push({ id: 'ending', label: 'Akhiran', width: '5.5rem', sort: 'ending' });
    if (result.counted && settings.strategy.showContinuation) {
      c.push({ id: 'cont', label: 'Lanjutan', width: '6rem', sort: 'continuation', align: 'right' });
    }
    if (result.counted && settings.showStrategyColumn) {
      c.push({ id: 'strategy', label: 'Strategi', width: '9.5rem', sort: result.scored ? 'score' : 'continuation' });
    }
    if (result.scored && settings.showScore) {
      c.push({ id: 'score', label: 'Skor', width: '4.5rem', sort: 'score', align: 'right' });
    }
    c.push({ id: 'action', label: 'Aksi', width: '6.5rem' });
    return c;
  }, [showLangColumn, settings, result.counted, result.scored]);

  const template = columns.map((c) => c.width).join(' ');
  const minWidth = `${columns.length * 5.5 + 6}rem`;

  // TanStack Virtual mengembalikan fungsi yang tidak bisa dimemoisasi React Compiler; ini disengaja.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtual = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const toggleSort = (col: SortColumn | undefined): void => {
    if (!col) return;
    setSort((cur) =>
      cur.col === col
        ? cur.dir === 'asc'
          ? { col, dir: 'desc' }
          : { col: 'default', dir: 'asc' }
        : { col, dir: col === 'score' || col === 'length' ? 'desc' : 'asc' },
    );
  };

  if (sorted.length === 0) {
    return <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">{emptyText}</p>;
  }

  return (
    <div
      ref={scrollRef}
      className="scroll-thin max-h-[30rem] overflow-auto rounded-xl border border-line bg-surface"
    >
      <div role="table" aria-label={title} aria-rowcount={sorted.length + 1} style={{ minWidth }}>
        <div
          role="row"
          aria-rowindex={1}
          className="sticky top-0 z-10 grid items-center border-b border-line bg-surface px-3 text-sm text-muted"
          style={{ gridTemplateColumns: template, height: 40 }}
        >
          {columns.map((c) => {
            const active = c.sort && sort.col === c.sort;
            return (
              <div
                key={c.id}
                role="columnheader"
                aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                className={cn(c.align === 'right' && 'text-right')}
              >
                {c.sort ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(c.sort)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded px-1 py-1 font-medium hover:text-ink',
                      active && 'text-accent-strong',
                    )}
                  >
                    {c.label}
                    {active ? (
                      sort.dir === 'asc' ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />
                    ) : null}
                  </button>
                ) : (
                  <span className="px-1 font-medium">{c.label}</span>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
          {virtual.getVirtualItems().map((vi) => {
            const r = sorted[vi.index]!;
            const v = rowView(result, r);
            const tail = tailOf(foldKey(v.word), result.tailLength);
            return (
              <div
                key={r}
                role="row"
                aria-rowindex={vi.index + 2}
                className={cn(
                  'absolute left-0 grid w-full items-center border-b border-line/70 px-3 text-[15px] hover:bg-canvas',
                  v.used && 'text-muted',
                )}
                style={{ gridTemplateColumns: template, height: ROW_HEIGHT, transform: `translateY(${vi.start}px)` }}
              >
                {columns.map((c) => (
                  <div key={c.id} role="cell" className={cn('min-w-0 px-1', c.align === 'right' && 'text-right')}>
                    {c.id === 'word' ? (
                      <div className="flex items-center gap-2">
                        <span className={cn('truncate font-medium', v.used && 'line-through decoration-muted/60')}>
                          {settings.showEnding && result.tailLength > 0 ? <HighlightTail word={v.word} n={result.tailLength} /> : v.word}
                        </span>
                        {v.used ? <Badge tone="bad">Terpakai</Badge> : null}
                        {KIND_BADGE[v.kind] ? <Badge tone="outline">{KIND_BADGE[v.kind]}</Badge> : null}
                        {v.kind === 'd' && v.tier >= 3 ? <Badge tone="outline">Jarang</Badge> : null}
                      </div>
                    ) : c.id === 'lang' ? (
                      <Badge>{LANGUAGE_LABEL[v.lang]}</Badge>
                    ) : c.id === 'ending' ? (
                      <span className="font-bold text-accent-strong">{tail}</span>
                    ) : c.id === 'cont' ? (
                      <span className="tabular">{v.continuation === null ? '—' : formatCount(v.continuation)}</span>
                    ) : c.id === 'strategy' ? (
                      <span className="flex items-center gap-1.5">
                        {v.difficulty ? <span>{DIFFICULTY_LABEL[v.difficulty]}</span> : <span>—</span>}
                        {v.recommended ? <Badge tone="accent">Pilihan</Badge> : null}
                      </span>
                    ) : c.id === 'score' ? (
                      <span className="tabular">{v.score === null ? '—' : Math.round(v.score)}</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={v.used || !settings.historyEnabled}
                        onClick={() => onMark(v.word, v.lang)}
                        aria-label={`Tandai ${v.word} sudah dipakai`}
                      >
                        <Check size={15} aria-hidden /> Tandai
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HighlightTail({ word, n }: { word: string; n: number }) {
  const [head, end] = splitDisplayTail(word, n);
  return (
    <>
      {head}
      <span className="font-bold text-accent-strong">{end}</span>
    </>
  );
}
