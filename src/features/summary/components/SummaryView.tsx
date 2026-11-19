/** A meeting's summary: the overview as a copper hero card, then cards for what was decided
 *  (highlighted), who does what, the key points and what follows. Empty sections are left out. The user's notes live beside
 *  the transcript, never repeated here. */

import React from 'react';
import { ArrowRight, CircleCheck, ListTodo, MessagesSquare, Sparkles, type LucideIcon } from 'lucide-react';
import type { ActionItem, StructuredSummary } from '@shared/types';
import { EmptyState, Markdown } from '@shared/components';
import { Chip, Icon, RociMark, Surface, Text, cn } from '@shared/ui';
import { TODOS_CONFIG } from '@config/todos.config';
import { SUMMARY_CONFIG as SUMMARY } from '@config/summary.config';
import { formatShortDate } from '@shared/utils/formatters';

interface SummaryViewProps {
  summary: string;
  structuredSummary?: StructuredSummary;
}

type SectionKey = 'decisions' | 'actions' | 'keyPoints' | 'nextSteps';

interface SectionMeta {
  title: string;
  icon: LucideIcon;
}

const SECTIONS: Record<SectionKey, SectionMeta> = {
  decisions: { title: SUMMARY.copy.decisions, icon: CircleCheck },
  actions: { title: SUMMARY.copy.actions, icon: ListTodo },
  keyPoints: { title: SUMMARY.copy.keyPoints, icon: MessagesSquare },
  nextSteps: { title: SUMMARY.copy.nextSteps, icon: ArrowRight },
};

const sectionId = (key: SectionKey) => `summary-${key}`;

/** The overview's heading: Roci's mark (written by the AI) and the title. */
const OverviewHeading: React.FC = () => (
  <div className="flex items-center gap-2">
    <Icon icon={RociMark} size="sm" tone="ai" />
    <Text as="h3" variant="title">{SUMMARY.copy.overview}</Text>
  </div>
);

const OverviewCard: React.FC<{ overview: string }> = ({ overview }) => (
  <Surface as="section" variant="ai" radius="lg" className="px-4 py-3.5 space-y-2.5">
    <OverviewHeading />
    <Text as="p" variant="lead">{overview}</Text>
  </Surface>
);

/** One section's card: icon, title and count, then its lines; `highlight` gives it the copper bar. */
const SectionCard: React.FC<{ section: SectionKey; count: number; highlight?: boolean; children: React.ReactNode }> = ({ section, count, highlight, children }) => (
  <Surface as="section" id={sectionId(section)} variant="subtle" radius="lg" className="flex gap-3 overflow-hidden px-4 py-3">
    {highlight && <Surface variant="aiBar" radius="full" className="w-1 shrink-0 self-stretch" />}
    <div className="flex-1 min-w-0 space-y-2">
      <div className="flex items-center gap-2">
        <Icon icon={SECTIONS[section].icon} size="sm" tone="muted" />
        <Text as="h3" variant="headline">{SECTIONS[section].title}</Text>
        <Text variant="figureSmall" tone="muted">{count}</Text>
      </div>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  </Surface>
);

/** One AI-written line, marked in copper. */
const Bullet: React.FC<{ children: React.ReactNode; mark?: LucideIcon }> = ({ children, mark }) => (
  <li className="flex items-baseline gap-3">
    {mark ? <Icon icon={mark} size="xs" tone="ai" className="shrink-0 translate-y-0.5" /> : <Text variant="reading" tone="ai" className="shrink-0">•</Text>}
    <Text as="p" variant="reading" className="flex-1 min-w-0">{children}</Text>
  </li>
);

const ListCard: React.FC<{ section: SectionKey; items?: string[]; highlight?: boolean; mark?: LucideIcon }> = ({ section, items, highlight, mark }) => {
  if (!items || items.length === 0) return null;
  return (
    <SectionCard section={section} count={items.length} highlight={highlight}>
      {items.map((item, idx) => <Bullet key={idx} mark={mark}>{item}</Bullet>)}
    </SectionCard>
  );
};

/** A due date as the Mac shows short dates ("21 Nov"); a YYYY-MM-DD day is read as local midnight, never UTC. */
const dueLabel = (dueDate: string): string => formatShortDate(`${dueDate}T00:00`) || dueDate;

/** An action item: the task, then who and when as chips. */
const ActionLine: React.FC<{ item: ActionItem }> = ({ item }) => (
  <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
    <Text variant="reading" tone="ai" className="shrink-0">○</Text>
    <Text as="p" variant="reading" className="flex-1 min-w-0">{item.text}</Text>
    {(item.owner || item.dueDate) && (
      <span className="flex shrink-0 gap-1.5">
        {item.owner && <Chip label={item.owner} />}
        {item.dueDate && <Chip label={dueLabel(item.dueDate)} />}
      </span>
    )}
  </li>
);

const ActionsCard: React.FC<{ items?: ActionItem[] }> = ({ items }) => {
  if (!items || items.length === 0) return null;
  const hidden = items.length - SUMMARY.actionPreview;
  return (
    <SectionCard section="actions" count={items.length}>
      {items.slice(0, SUMMARY.actionPreview).map((item) => <ActionLine key={item.id} item={item} />)}
      {hidden > 0 && <li><Text variant="helper" tone="muted">{SUMMARY.copy.more(hidden, TODOS_CONFIG.title)}</Text></li>}
    </SectionCard>
  );
};

const Structured: React.FC<{ summary: StructuredSummary }> = ({ summary }) => {
  // decisions and action items side by side when both are there; either alone takes the full width
  const pair = (summary.decisionsMade?.length ?? 0) > 0 && (summary.actionItems?.length ?? 0) > 0;
  return (
    <>
      {summary.overview && <OverviewCard overview={summary.overview} />}
      <div className={cn('grid gap-3 empty:hidden', pair && 'md:grid-cols-2')}>
        <ListCard section="decisions" items={summary.decisionsMade} highlight mark={CircleCheck} />
        <ActionsCard items={summary.actionItems} />
      </div>
      <ListCard section="keyPoints" items={summary.keyDiscussionPoints} />
      <ListCard section="nextSteps" items={summary.nextSteps} />
    </>
  );
};

export const SummaryView: React.FC<SummaryViewProps> = ({ summary, structuredSummary }) => {
  if (!summary && !structuredSummary) return <EmptyState icon={Sparkles} message={SUMMARY.copy.none} />;
  return (
    <div className="space-y-3">
      {structuredSummary ? <Structured summary={structuredSummary} /> : <Markdown content={summary} />}
    </div>
  );
};

/** In place of the summary while it is being written: the hero card it will fill, its text shimmering. */
export const SummaryWriting: React.FC<{ label: string }> = ({ label }) => (
  <Surface role="status" variant="ai" radius="lg" className="px-4 py-3.5 space-y-2.5">
    <OverviewHeading />
    <Text as="p" variant="lead" shimmer>{SUMMARY.copy.writingPlaceholder}</Text>
    <Text as="p" variant="helper" tone="muted">{label}</Text>
  </Surface>
);
