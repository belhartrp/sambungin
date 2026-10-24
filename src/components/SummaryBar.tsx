'use client';
import { Badge } from '@/components/ui/badge';
import { formatCount } from '@/lib/strategy';
import { useApp } from '@/store/app';

const LANG_TEXT = { id: 'Indonesia', en: 'English', mixed: 'Campuran' } as const;

export function SummaryBar() {
  const rule = useApp((s) => s.rule);
  const result = useApp((s) => s.result);
  const language = useApp((s) => s.settings.language);
  const excludeUsed = useApp((s) => s.settings.excludeUsed);
  const ruleMode = useApp((s) => s.settings.rule.mode);
  const fixedLength = useApp((s) => s.settings.rule.fixedLength);

  if (!rule.prefix) return null;

  return (
    <dl aria-label="Ringkasan pencarian" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <div className="flex items-baseline gap-2">
        <dt className="text-muted">Awalan aktif</dt>
        <dd className="rounded-md bg-accent-soft px-2 py-0.5 text-lg font-bold text-accent-strong">{rule.prefix}</dd>
      </div>
      {result ? (
        <>
          <div className="flex items-baseline gap-2">
            <dt className="text-muted">Ditemukan</dt>
            <dd className="tabular font-bold">{formatCount(result.matched)}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-muted">Belum dipakai</dt>
            <dd className="tabular font-bold">{formatCount(result.available)}</dd>
          </div>
        </>
      ) : null}
      <div className="flex items-baseline gap-2">
        <dt className="text-muted">Bahasa</dt>
        <dd className="font-medium">{LANG_TEXT[language]}</dd>
      </div>
      <div className="flex items-baseline gap-2">
        <dt className="text-muted">Sambung</dt>
        <dd className="font-medium">
          {ruleMode === 'fixed' ? `${fixedLength} huruf terakhir` : `${rule.tailLength} huruf`}
        </dd>
      </div>
      {!excludeUsed && result && result.usedMatched > 0 ? (
        <Badge tone="outline">{result.usedMatched} kata terpakai ikut tampil</Badge>
      ) : null}
      {rule.short ? <Badge tone="outline">Input lebih pendek dari aturan {fixedLength} huruf</Badge> : null}
    </dl>
  );
}
