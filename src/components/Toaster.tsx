'use client';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useApp } from '@/store/app';

const ICON = { info: Info, success: CircleCheck, error: CircleAlert } as const;

export function Toaster() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 top-3 z-[60] flex flex-col items-center gap-2 md:inset-x-auto md:bottom-4 md:left-1/2 md:top-auto md:-translate-x-1/2"
    >
      {toasts.map((t) => {
        const Icon = ICON[t.tone];
        return (
          <div
            key={t.id}
            className="toast-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-line-strong bg-ink px-4 py-3 text-sm text-white md:w-auto"
          >
            <Icon size={18} className={cn('shrink-0', t.tone === 'info' ? 'text-white' : t.tone === 'success' ? 'text-[#7ee2a3]' : 'text-[#ffb4ab]')} aria-hidden />
            <span className="min-w-0 flex-1">{t.message}</span>
            {t.actionLabel ? (
              <button
                type="button"
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
                className="shrink-0 rounded-md px-2 py-1 font-bold text-white underline underline-offset-4 hover:bg-white/10"
              >
                {t.actionLabel}
              </button>
            ) : null}
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/10" onClick={() => dismiss(t.id)} aria-label="Tutup pemberitahuan">
              <X size={15} aria-hidden />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
