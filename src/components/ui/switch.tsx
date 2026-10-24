'use client';
import * as RadixSwitch from '@radix-ui/react-switch';
import { cn } from '@/lib/cn';

export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof RadixSwitch.Root>) {
  return (
    <RadixSwitch.Root
      className={cn(
        'relative h-6 w-11 shrink-0 cursor-pointer rounded-full bg-line-strong transition-colors',
        'data-[state=checked]:bg-accent data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45',
        className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[22px]" />
    </RadixSwitch.Root>
  );
}
