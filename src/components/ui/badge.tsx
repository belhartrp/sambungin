import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'accent' | 'ok' | 'bad' | 'outline';

const TONE: Record<Tone, string> = {
  neutral: 'bg-ink/6 text-ink',
  accent: 'bg-accent-soft text-accent-strong',
  ok: 'bg-ok-soft text-ok',
  bad: 'bg-bad-soft text-bad',
  outline: 'border border-line-strong text-muted',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium leading-4',
        TONE[tone],
        className,
      )}
      {...props}
    />
  );
}
