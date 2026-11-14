import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import React from 'react';

/** Mounted once in AppProviders; every Tooltip shares its open/close delay. */
export const TooltipProvider = TooltipPrimitive.Provider;

export interface TooltipProps {
  content: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** The element that shows the tooltip on hover/focus (rendered asChild). */
  children: React.ReactElement;
}

/** Inverted hint bubble (macOS help tag). */
export function Tooltip({ content, side = 'top', children }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 px-2 py-1 rounded-md bg-inverse text-inverse text-callout shadow-floating data-[state=delayed-open]:animate-content-show"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
