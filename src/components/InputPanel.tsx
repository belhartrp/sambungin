'use client';
import { useEffect, useRef } from 'react';
import { Eraser, LoaderCircle, Mic, MicOff, Square, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { useSpeech } from '@/hooks/useSpeech';
import { cn } from '@/lib/cn';
import { effectiveInputs } from '@/lib/settings';
import type { InputMode } from '@/lib/speech/intent';
import { useApp } from '@/store/app';

const PLACEHOLDER: Record<InputMode, string> = {
  prefix: 'Ketik awalan, mis. ab',
  mark: 'Ketik kata yang baru dimainkan',
};

export function InputPanel() {
  const settings = useApp((s) => s.settings);
  const mode = useApp((s) => s.mode);
  const text = useApp((s) => (s.mode === 'mark' ? s.markText : s.prefixText));
  const interim = useApp((s) => s.interim);
  const lastHeard = useApp((s) => s.lastHeard);
  const ready = useApp((s) => s.dataset.status === 'ready');
  const setMode = useApp((s) => s.setMode);
  const setInputText = useApp((s) => s.setInputText);
  const clearInput = useApp((s) => s.clearInput);
  const markCurrentText = useApp((s) => s.markCurrentText);
  const historyEnabled = settings.historyEnabled;

  const speech = useSpeech();
  const inputs = effectiveInputs(settings, speech.supported);
  const inputRef = useRef<HTMLInputElement>(null);

  // Pintasan "/" memfokuskan kolom input, selama tidak sedang mengetik di kolom lain.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const micAvailable = settings.voiceInput && speech.supported;
  const micDisabled = !micAvailable || (speech.state === 'unsupported');

  let micLabel = 'Mulai mendengarkan';
  if (speech.active) micLabel = 'Berhenti mendengarkan';
  if (!settings.voiceInput) micLabel = 'Input suara dimatikan di Pengaturan';
  else if (!speech.supported) micLabel = 'Browser ini tidak mendukung pengenalan suara';

  return (
    <section aria-label="Input kata" className="rounded-2xl border border-line bg-surface p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented<InputMode>
          label="Mode input"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'prefix', label: 'Cari awalan' },
            { value: 'mark', label: 'Tandai kata' },
          ]}
        />
        {mode === 'mark' && !historyEnabled ? (
          <span className="text-sm text-muted">Pencatatan kata dimatikan</span>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={speech.toggle}
          disabled={micDisabled}
          aria-label={micLabel}
          aria-pressed={speech.active}
          title={micLabel}
          className={cn(
            'relative grid h-16 w-16 shrink-0 place-items-center rounded-full text-white transition-colors sm:h-[72px] sm:w-[72px]',
            micDisabled ? 'cursor-not-allowed bg-line-strong' : 'bg-accent hover:bg-accent-strong',
            speech.active && 'mic-pulse bg-accent-strong',
          )}
        >
          {speech.state === 'starting' ? (
            <LoaderCircle size={28} className="animate-spin" aria-hidden />
          ) : speech.active ? (
            <Square size={24} fill="currentColor" aria-hidden />
          ) : micDisabled ? (
            <MicOff size={28} aria-hidden />
          ) : (
            <Mic size={30} aria-hidden />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="relative">
            {inputs.manual ? (
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && mode === 'mark') void markCurrentText();
                }}
                placeholder={PLACEHOLDER[mode]}
                aria-label={mode === 'prefix' ? 'Awalan' : 'Kata yang baru dimainkan'}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint={mode === 'mark' ? 'done' : 'search'}
                className="h-12 w-full rounded-xl border border-line-strong bg-surface pl-4 pr-12 text-xl font-medium tracking-wide outline-none placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-muted/80 focus:border-accent focus-visible:outline-2 sm:h-14 sm:text-2xl"
              />
            ) : (
              <output
                aria-label="Teks terbaca"
                className="flex h-12 w-full items-center rounded-xl border border-line bg-canvas px-4 text-xl font-medium sm:h-14 sm:text-2xl"
              >
                {text || <span className="text-base font-normal text-muted">Menunggu ucapan</span>}
              </output>
            )}
            {text ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Hapus input"
                onClick={clearInput}
                className="absolute right-1 top-1/2 h-10 w-10 -translate-y-1/2"
              >
                <Eraser size={18} aria-hidden />
              </Button>
            ) : null}
          </div>
          {mode === 'mark' ? (
            <div className="mt-2 flex justify-end">
              <Button
                variant="primary"
                size="md"
                disabled={!text.trim() || !historyEnabled || !ready}
                onClick={() => void markCurrentText()}
              >
                Tandai sudah dipakai
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div
        aria-live="polite"
        className={cn('mt-3 min-h-6 text-sm text-muted', text && !speech.active && 'hidden sm:block')}
      >
        {speech.active ? (
          <p className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-bad" aria-hidden />
            <span className="font-medium text-ink">Mendengarkan</span>
            {interim ? <span className="truncate italic">“{interim}”</span> : <span>Ucapkan sekarang</span>}
          </p>
        ) : lastHeard ? (
          <p className="truncate">
            Terdengar terakhir: <span className="font-medium text-ink">“{lastHeard}”</span>
          </p>
        ) : micAvailable ? (
          <p>
            {mode === 'prefix'
              ? 'Tekan mikrofon dan ucapkan huruf, misalnya “a b”. Hasil muncul otomatis.'
              : 'Ucapkan kata yang baru dimainkan, atau ketik lalu tekan Enter.'}
          </p>
        ) : (
          <p>
            {settings.voiceInput && !speech.supported
              ? 'Browser ini tidak mendukung pengenalan suara. Gunakan kolom ketik di atas (Chrome atau Edge mendukung suara).'
              : 'Input suara dimatikan. Gunakan kolom ketik.'}
          </p>
        )}
      </div>

      {speech.error && speech.error.kind !== 'no-speech' ? (
        <p role="alert" className="mt-2 flex items-start gap-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
          {speech.error.message}
        </p>
      ) : speech.error ? (
        <p className="mt-2 text-sm text-muted">{speech.error.message}</p>
      ) : null}
    </section>
  );
}
