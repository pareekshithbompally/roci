import React from 'react';
import { cn } from './utils';

export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  orientation?: 'horizontal' | 'vertical';
}

/** Native range input in the accent colour (macOS slider). */
export function Slider({ orientation = 'horizontal', className, ...props }: SliderProps) {
  return (
    <input
      type="range"
      className={cn(
        'appearance-auto cursor-pointer accent-[color:var(--bg-accent)]',
        orientation === 'vertical' ? 'h-24 w-1.5 [writing-mode:vertical-lr] [direction:rtl]' : 'w-full h-1.5',
        className,
      )}
      {...props}
    />
  );
}
