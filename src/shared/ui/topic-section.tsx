/** A titled group of short lines inside content (a meeting summary's Decisions, Action items, Key points, Next steps): one
 *  pattern for all of them. A Mac shows each as a quiet card; iPhone without the box (its heading, its lines, a hairline
 *  between groups) at the callout size, so a summary reads as a page, not a stack of boxes. */

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { useFormFactor } from '@platform/formFactor';
import { Icon } from './icon';
import { Surface } from './surface';
import { Text } from './text';

export interface TopicSectionProps {
  /** Its anchor (a link to it). */
  id?: string;
  title: string;
  icon: LucideIcon;
  count: number;
  /** Its `TopicLine`s. */
  children: React.ReactNode;
}

export function TopicSection({ id, title, icon, count, children }: TopicSectionProps) {
  const phone = useFormFactor() === 'phone';
  const body = (
    <>
      <div className="flex items-center gap-2">
        <Icon icon={icon} size="sm" tone="muted" />
        <Text as="h3" variant="headline">{title}</Text>
        <Text variant="figureSmall" tone="muted">{count}</Text>
      </div>
      <ul className="space-y-1.5">{children}</ul>
    </>
  );
  if (phone) return <Surface as="section" id={id} edge="top" className="space-y-2 pt-3">{body}</Surface>;
  return <Surface as="section" id={id} variant="subtle" radius="lg" className="space-y-2 px-4 py-3">{body}</Surface>;
}

/** One line of a topic: the AI's mark, the text, and anything about it at the end (who, when). */
export function TopicLine({ trailing, children }: { trailing?: React.ReactNode; children: React.ReactNode }) {
  const variant = useFormFactor() === 'phone' ? 'helper' : 'reading';
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <Text variant={variant} tone="ai" className="shrink-0">•</Text>
      <Text as="p" variant={variant} className="min-w-0 flex-1">{children}</Text>
      {trailing && <span className="flex shrink-0 gap-1.5">{trailing}</span>}
    </li>
  );
}
