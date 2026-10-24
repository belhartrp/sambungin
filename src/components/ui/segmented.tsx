'use client';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { cn } from '@/lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Label aksesibel bila label visual berupa singkatan. */
  ariaLabel?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
  disabled,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentedOption<T>[];
  label: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      // Radix mengirim '' saat item aktif ditekan lagi; pilihan tidak boleh kosong.
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      disabled={disabled}
      className={cn('inline-flex rounded-xl bg-ink/6 p-0.5', disabled && 'opacity-50', className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          aria-label={o.ariaLabel}
          className={cn(
            'rounded-[10px] font-medium text-muted transition-colors',
            'hover:text-ink data-[state=on]:bg-surface data-[state=on]:text-accent-strong data-[state=on]:shadow-[0_0_0_1px_var(--color-line-strong)]',
            size === 'sm' ? 'h-8 px-2.5 text-sm' : 'h-9 px-3.5 text-[15px]',
          )}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
