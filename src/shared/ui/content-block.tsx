/** One frame for a block inside content (a reply's table, a tool's output): a filled card with a slim header, its label at
 *  the leading edge and its actions at the trailing edge (shown on hover on a Mac, always on touch). A reply's code blocks
 *  (Streamdown's own) take the same tokens in markdown.css, so every block reads as one kind of thing. */

import React from 'react';
import { HoverReveal } from './row';
import { Text } from './text';
import { cn } from './utils';

export interface ContentBlockProps {
  label: string;
  /** Icon buttons at the header's trailing edge (Copy, Save, Expand). */
  actions?: React.ReactNode;
  /** The body keeps the frame's inset (text); without it the content runs to the frame's edges (a table). */
  padded?: boolean;
  children: React.ReactNode;
}

export function ContentBlock({ label, actions, padded, children }: ContentBlockProps) {
  return (
    <div data-content-block className="group/row overflow-hidden rounded-block bg-layer-1">
      <div className="flex min-h-control-sm items-center justify-between gap-2 border-b border-muted pl-3 pr-1">
        <Text variant="label" tone="faint" truncate>{label}</Text>
        {actions && <HoverReveal className="flex items-center">{actions}</HoverReveal>}
      </div>
      <div className={cn(padded && 'px-3 py-2')}>{children}</div>
    </div>
  );
}
