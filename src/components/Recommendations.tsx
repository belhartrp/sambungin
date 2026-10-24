'use client';
import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { foldKey, tailOf } from '@/lib/normalize';
import { explainRow, rowView } from '@/lib/resultsView';
import { DIFFICULTY_LABEL } from '@/lib/strategy';
import { LANGUAGE_LABEL } from '@/lib/types';
import { useApp } from '@/store/app';
import { TailWord } from './TailWord';

export function Recommendations() {
  const result = useApp((s) => s.result);
  const settings = useApp((s) => s.settings);
  const rule = useApp((s) => s.rule);
  const mark = useApp((s) => s.markWordFromRow);

  if (!rule.prefix || !result) return null;
  const { strategy } = settings;

  if (!strategy.enabled) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm text-muted">
        Rekomendasi strategi dimatikan. Aktifkan “Rekomendasi menyulitkan lawan” di Pengaturan untuk melihat kata
        pilihan.
      </p>
    );
  }
  if (result.top.length === 0) return null;

  const mixed = settings.language === 'mixed';
  return (
    <section aria-labelledby="rec-title">
      <h2 id="rec-title" className="mb-2 text-base font-bold">
        Rekomendasi
      </h2>
      <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {result.top.map((r, n) => {
          const v = rowView(result, r);
          const tail = tailOf(foldKey(v.word), result.tailLength);
          const notes = explainRow(result, r);
          const first = n === 0;
          return (
            <li
              key={`${v.word}-${v.lang}`}
              className={cn(
                'flex flex-col gap-2 rounded-[14px] border bg-surface p-4',
                first ? 'border-accent md:col-span-2 xl:col-span-1' : 'border-line',
              )}
            >
              <div>
                <TailWord
                  word={v.word}
                  tail={result.tailLength}
                  highlight={settings.showEnding}
                  className={cn('block font-bold leading-tight [overflow-wrap:anywhere]', first ? 'text-3xl' : 'text-2xl')}
                />
                <div className="mt-2 flex flex-wrap gap-1">
                  {mixed || settings.showLanguageLabel ? <Badge>{LANGUAGE_LABEL[v.lang]}</Badge> : null}
                  {v.difficulty ? (
                    <Badge tone={v.continuation === 0 ? 'accent' : 'outline'}>{DIFFICULTY_LABEL[v.difficulty]}</Badge>
                  ) : null}
                  {first ? <Badge tone="accent">Terbaik</Badge> : null}
                </div>
              </div>

              {result.counted && v.continuation !== null ? (
                <p className="text-[15px]">
                  Lawan harus mulai dengan{' '}
                  <strong className="rounded bg-accent-soft px-1 text-accent-strong">{tail}</strong>
                </p>
              ) : null}

              {notes.length > 0 ? (
                <ul className="space-y-0.5 text-sm text-muted">
                  {notes.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                {settings.showScore && v.score !== null ? (
                  <span className="tabular text-sm text-muted">
                    Skor <strong className="text-ink">{Math.round(v.score)}</strong>
                  </span>
                ) : (
                  <span />
                )}
                <Button
                  size="sm"
                  variant={first ? 'primary' : 'secondary'}
                  disabled={!settings.historyEnabled}
                  onClick={() => mark(v.word, v.lang)}
                  aria-label={`Tandai ${v.word} sudah dipakai`}
                >
                  <Check size={16} aria-hidden /> Tandai
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
