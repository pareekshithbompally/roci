import * as SwitchPrimitive from '@radix-ui/react-switch';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from './utils';

interface SwitchProps extends ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  size?: 'sm' | 'md';
  /** Legacy prop — prefer onCheckedChange */
  onChange?: (checked: boolean) => void;
}

const sizeStyles = {
  sm: {
    root: 'h-3.5 w-6',
    thumb: 'h-2.5 w-2.5 data-[state=checked]:translate-x-2.5',
  },
  md: {
    root: 'h-5 w-9',
    thumb: 'h-4 w-4 data-[state=checked]:translate-x-4',
  },
};

export const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(({ className, size = 'md', onChange, onCheckedChange, ...props }, ref) => {
  const styles = sizeStyles[size];

  const handleCheckedChange = (checked: boolean) => {
    onCheckedChange?.(checked);
    onChange?.(checked);
  };

  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        'peer inline-flex shrink-0 cursor-pointer',
        'rounded-full border-2 border-transparent',
        'transition-colors',
        'bg-[var(--switch-inactive)]',
        'data-[state=checked]:bg-[var(--switch-active)]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus-visible:ring-2 focus-visible:ring-[var(--border-ring)]',
        styles.root,
        className,
      )}
      onCheckedChange={handleCheckedChange}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block',
          'rounded-full',
          'bg-[var(--switch-thumb)]',
          'shadow-sm',
          'transition-transform',
          'data-[state=unchecked]:translate-x-0',
          styles.thumb,
        )}
      />
    </SwitchPrimitive.Root>
  );
});
Switch.displayName = 'Switch';
