import React from 'react';

export interface TooltipProps {
  content: string;
  /** The element that shows the tooltip on hover. */
  children: React.ReactElement<{ title?: string }>;
}

/** The system help tag: macOS shows `title` on hover; touch screens have no hover, so nothing shows there. */
export function Tooltip({ content, children }: TooltipProps) {
  return React.cloneElement(children, { title: content });
}
