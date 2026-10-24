'use client';
import { Database, LoaderCircle, Settings as SettingsIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/cn';
import type { LanguageMode } from '@/lib/types';
import { useApp } from '@/store/app';
import { Logo } from './Logo';

const compact = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 0 });

export function Header({ onSettings, onDataset }: { onSettings: () => void; onDataset: () => void }) {
  const language = useApp((s) => s.settings.language);
  const patchSettings = useApp((s) => s.patchSettings);
  const dataset = useApp((s) => s.dataset);
  const manifest = useApp((s) => s.manifest);
  const custom = useApp((s) => s.custom.length);

  const total = manifest ? manifest.languages.id.count + manifest.languages.en.count + custom : 0;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur-sm supports-[not(backdrop-filter:blur(1px))]:bg-surface">
      <div className="mx-auto flex max-w-[78rem] items-center gap-3 px-3 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo />
          <div className="min-w-0 leading-tight">
            <p className="text-lg font-extrabold">Sambungin</p>
            <p className="hidden text-xs text-muted lg:block">Find the word. Win the round.</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Segmented<LanguageMode>
            label="Bahasa aktif"
            size="sm"
            value={language}
            onChange={(v) => patchSettings({ language: v })}
            options={[
              { value: 'id', label: <><span className="sm:hidden">ID</span><span className="hidden sm:inline">Indonesia</span></>, ariaLabel: 'Indonesia' },
              { value: 'en', label: <><span className="sm:hidden">EN</span><span className="hidden sm:inline">English</span></>, ariaLabel: 'English' },
              { value: 'mixed', label: <><span className="sm:hidden">Campur</span><span className="hidden sm:inline">Campuran</span></>, ariaLabel: 'Campuran' },
            ]}
          />

          <button
            type="button"
            onClick={onDataset}
            className="flex h-9 items-center gap-2 rounded-xl border border-line-strong px-2.5 text-sm font-medium hover:bg-canvas"
            aria-label={
              dataset.status === 'ready'
                ? `Dataset siap, ${total} kata. Buka panel dataset`
                : dataset.status === 'error'
                  ? 'Dataset gagal dimuat. Buka panel dataset'
                  : 'Dataset sedang dimuat. Buka panel dataset'
            }
          >
            {dataset.status === 'loading' || dataset.status === 'idle' ? (
              <LoaderCircle size={15} className="animate-spin text-accent" aria-hidden />
            ) : (
              <span
                aria-hidden
                className={cn('h-2.5 w-2.5 rounded-full', dataset.status === 'ready' ? 'bg-ok' : 'bg-bad')}
              />
            )}
            <Database size={16} className="hidden text-muted sm:block" aria-hidden />
            <span className="tabular hidden sm:inline">
              {dataset.status === 'ready'
                ? `${compact.format(total)} kata`
                : dataset.status === 'error'
                  ? 'Gagal'
                  : `${Math.round(dataset.fraction * 100)}%`}
            </span>
          </button>

          <Button variant="secondary" size="icon" onClick={onSettings} aria-label="Buka pengaturan">
            <SettingsIcon size={19} aria-hidden />
          </Button>
        </div>
      </div>
    </header>
  );
}
