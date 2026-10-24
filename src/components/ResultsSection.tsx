'use client';
import { useMemo, useState } from 'react';
import { LoaderCircle, Search, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildTables, filterRows } from '@/lib/resultsView';
import { languagesOf } from '@/lib/settings';
import { formatCount } from '@/lib/strategy';
import { useApp } from '@/store/app';
import { ResultTable } from './ResultTable';

function Notice({
  icon,
  title,
  children,
  tone = 'neutral',
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  tone?: 'neutral' | 'bad';
}) {
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={
        tone === 'bad'
          ? 'rounded-2xl border border-bad/30 bg-bad-soft px-5 py-6 text-bad'
          : 'rounded-2xl border border-dashed border-line-strong bg-surface px-5 py-8 text-center'
      }
    >
      {icon ? <div className="mb-2 flex justify-center">{icon}</div> : null}
      <p className="font-bold">{title}</p>
      {children ? <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function ResultsSection() {
  const dataset = useApp((s) => s.dataset);
  const result = useApp((s) => s.result);
  const rule = useApp((s) => s.rule);
  const searching = useApp((s) => s.searching);
  const searchError = useApp((s) => s.searchError);
  const settings = useApp((s) => s.settings);
  const patchSettings = useApp((s) => s.patchSettings);
  const retry = useApp((s) => s.retryDataset);
  const mark = useApp((s) => s.markWordFromRow);
  const [query, setQuery] = useState('');

  const languages = useMemo(() => languagesOf(settings.language), [settings.language]);
  const tables = useMemo(
    () => (result ? buildTables(result, settings.view, languages) : []),
    [result, settings.view, languages],
  );

  if (dataset.status === 'loading' || dataset.status === 'idle') {
    const pct = Math.round(dataset.fraction * 100);
    return (
      <Notice icon={<LoaderCircle className="animate-spin text-accent" aria-hidden />} title="Memuat dataset kosakata">
        <p>
          {dataset.stage === 'parse' ? 'Menyusun indeks pencarian' : 'Mengunduh data kata'} ({pct}%). Pencarian aktif
          setelah selesai. Pengunduhan hanya sekali, berikutnya dari cache browser.
        </p>
        <div className="mx-auto mt-3 h-1.5 w-56 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </Notice>
    );
  }

  if (dataset.status === 'error') {
    return (
      <Notice tone="bad" icon={<TriangleAlert aria-hidden />} title="Dataset gagal dimuat">
        <p className="text-bad">{dataset.message}</p>
        <Button className="mt-3" variant="danger" onClick={retry}>
          Coba lagi
        </Button>
      </Notice>
    );
  }

  if (searchError) {
    return (
      <Notice tone="bad" icon={<TriangleAlert aria-hidden />} title="Pencarian gagal">
        <p className="text-bad">{searchError}</p>
      </Notice>
    );
  }

  if (!rule.prefix) {
    return (
      <Notice icon={<Search className="text-muted" aria-hidden />} title="Belum ada awalan">
        <p>
          Ucapkan atau ketik huruf yang harus disambungkan, misalnya “ab”. Kata yang cocok muncul otomatis, lengkap
          dengan rekomendasi untuk menyulitkan lawan.
        </p>
      </Notice>
    );
  }

  if (!result) {
    return (
      <Notice icon={<LoaderCircle className="animate-spin text-accent" aria-hidden />} title="Mencari kata">
        {searching ? <p>Sebentar.</p> : null}
      </Notice>
    );
  }

  if (result.matched === 0) {
    return (
      <Notice title={`Tidak ada kata berawalan “${result.prefix}”`}>
        <p>
          Tidak ada yang cocok pada bahasa dan cakupan kosakata saat ini. Coba bahasa Campuran atau cakupan “Luas” di
          Pengaturan, atau tambahkan kata sendiri di panel Dataset.
        </p>
      </Notice>
    );
  }

  if (result.available === 0 && settings.excludeUsed) {
    return (
      <Notice title={`Semua ${formatCount(result.matched)} kata berawalan “${result.prefix}” sudah digunakan`}>
        <p>Anda bisa menampilkannya kembali dengan mematikan filter kata yang sudah digunakan.</p>
        <Button className="mt-3" onClick={() => patchSettings({ excludeUsed: false })}>
          Tampilkan kata terpakai
        </Button>
      </Notice>
    );
  }

  const split = tables.length > 1;
  return (
    <section aria-labelledby="res-title" className="space-y-3" aria-busy={searching}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="res-title" className="text-base font-bold">
          Hasil
        </h2>
        <label className="relative block w-full sm:w-64">
          <span className="sr-only">Saring hasil</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Saring hasil"
            className="h-10 w-full rounded-xl border border-line-strong bg-surface pl-9 pr-3 text-[15px] outline-none focus:border-accent"
          />
        </label>
      </div>
      <div className={split ? 'grid gap-4 xl:grid-cols-2' : ''}>
        {tables.map((t) => {
          const rows = filterRows(result, t.rows, query);
          return (
            <div key={t.id} className="min-w-0 space-y-2">
              <h3 className="flex items-baseline gap-2 text-sm font-bold">
                {t.title}
                <span className="tabular font-normal text-muted">
                  {query ? `${formatCount(rows.length)} dari ${formatCount(t.rows.length)}` : formatCount(t.rows.length)} kata
                </span>
              </h3>
              <ResultTable
                title={t.title}
                result={result}
                rows={rows}
                settings={settings}
                showLangColumn={!split && languages.length > 1 && settings.showLanguageLabel}
                onMark={mark}
                emptyText={
                  query ? `Tidak ada hasil untuk “${query}”.` : `Tidak ada kata ${t.id === 'en' ? 'Inggris' : 'Indonesia'} yang cocok.`
                }
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
