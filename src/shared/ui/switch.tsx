import * as SwitchPrimitive from '@radix-ui/react-switch';
import type { ComponentProps } from 'react';
import { cn } from './utils';

/** macOS switch: accent when on, knob lifted by the input elevation. */
export interface SwitchProps extends ComponentProps<typeof SwitchPrimitive.Root> {
  size?: 'sm' | 'md';
}

/** Dimensions come from tokens.css (macOS sizes; the iOS 51×31 switch under html.platform-ios). */
const SIZE = {
  sm: {
    root: 'h-[var(--switch-sm-h)] w-[var(--switch-sm-w)]',
    thumb: 'h-[var(--switch-sm-thumb)] w-[var(--switch-sm-thumb)] data-[state=checked]:translate-x-[var(--switch-sm-travel)]',
  },
  md: {
    root: 'h-[var(--switch-md-h)] w-[var(--switch-md-w)]',
    thumb: 'h-[var(--switch-md-thumb)] w-[var(--switch-md-thumb)] data-[state=checked]:translate-x-[var(--switch-md-travel)]',
  },
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
