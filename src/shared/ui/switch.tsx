import * as SwitchPrimitive from '@radix-ui/react-switch';
import type { ComponentProps } from 'react';
import { cn } from './utils';

/** macOS switch: accent when on, knob lifted by the input elevation. */
export interface SwitchProps extends ComponentProps<typeof SwitchPrimitive.Root> {
  size?: 'sm' | 'md';
}

const SIZE = {
  sm: { root: 'h-3.5 w-6', thumb: 'h-2.5 w-2.5 data-[state=checked]:translate-x-2.5' },
  md: { root: 'h-5 w-9', thumb: 'h-4 w-4 data-[state=checked]:translate-x-4' },
};

export function Switch({ className, size = 'md', ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
        'bg-layer-4 data-[state=checked]:bg-accent',
        'outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50 disabled:cursor-not-allowed',
        SIZE[size].root,
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block rounded-full bg-knob shadow-input transition-transform data-[state=unchecked]:translate-x-0',
          SIZE[size].thumb,
        )}
      />
    </SwitchPrimitive.Root>
  );
}
