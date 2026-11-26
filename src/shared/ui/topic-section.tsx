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
  /** A control at the heading's end (Edit). */
  action?: React.ReactNode;
  /** Its `TopicLine`s. */
  children: React.ReactNode;
}

export function TopicSection({ id, title, icon, count, action, children }: TopicSectionProps) {
  const phone = useFormFactor() === 'phone';
  const body = (
    <>
      <div className="flex items-center gap-2">
        <Icon icon={icon} size="sm" tone="muted" />
        <Text as="h3" variant="headline">{title}</Text>
        <Text variant="figureSmall" tone="muted">{count}</Text>
        {action && <div className="ml-auto flex items-center">{action}</div>}
      </div>
      <ul className="space-y-1.5">{children}</ul>
    </>
  );
  if (phone) return <Surface as="section" id={id} edge="top" className="space-y-2 pt-3">{body}</Surface>;
  return <Surface as="section" id={id} variant="subtle" radius="lg" className="space-y-2 px-4 py-3">{body}</Surface>;
}

/** A topic's own text size: the reading size on a Mac, the callout size on iPhone, so every part of a summary reads at one
 *  size. */
function useTopicText(): 'reading' | 'helper' {
  return useFormFactor() === 'phone' ? 'helper' : 'reading';
}

/** The lead of a group of topics (a summary's Overview): the same heading and text as its topics, on the AI's card. */
export function TopicLead({ title, shimmer, children }: { title: string; shimmer?: boolean; children: React.ReactNode }) {
  return (
    <Surface as="section" variant="ai" radius="lg" className="space-y-2 px-4 py-3">
      <Text as="h3" variant="headline">{title}</Text>
      <Text as="p" variant={useTopicText()} shimmer={shimmer}>{children}</Text>
    </Surface>
  );
}

/** One line of a topic: the AI's mark, the text, and anything about it at the end (who, when). */
export function TopicLine({ trailing, children }: { trailing?: React.ReactNode; children: React.ReactNode }) {
  const variant = useTopicText();
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <Text variant={variant} tone="ai" className="shrink-0">•</Text>
      <Text as="p" variant={variant} className="min-w-0 flex-1">{children}</Text>
      {trailing && <span className="flex shrink-0 gap-1.5">{trailing}</span>}
    </li>
  );
}
