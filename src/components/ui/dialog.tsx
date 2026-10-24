'use client';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './button';

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

function Frame({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  contentClass,
}: BaseProps & { contentClass: string }) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <RadixDialog.Content
          className={cn('fixed z-50 flex flex-col bg-surface outline-none', contentClass)}
          aria-describedby={description ? undefined : undefined}
        >
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <RadixDialog.Title className="text-lg font-bold leading-6">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-sm text-muted">
                  {description}
                </RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Tutup" className="-mr-2 -mt-1">
                <X size={20} aria-hidden />
              </Button>
            </RadixDialog.Close>
          </header>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <footer className="border-t border-line px-5 py-3">{footer}</footer> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Dialog di tengah layar; penuh layar di ponsel. */
export function Modal(props: BaseProps & { wide?: boolean }) {
  return (
    <Frame
      {...props}
      contentClass={cn(
        'inset-0 md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[88vh] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl',
        props.wide ? 'md:w-[min(56rem,94vw)]' : 'md:w-[min(30rem,94vw)]',
      )}
    />
  );
}

/** Panel geser dari kanan. */
export function Drawer(props: BaseProps) {
  return (
    <Frame
      {...props}
      contentClass="inset-y-0 right-0 w-full sm:w-[min(32rem,100vw)] sm:border-l sm:border-line"
    />
  );
}
