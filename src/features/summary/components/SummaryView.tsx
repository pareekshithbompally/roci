/** A meeting's summary: the overview as a copper hero card, then what was decided, who does what, the key points and what
 *  follows, all one pattern (kit `TopicSection`). Empty sections are left out. The user's notes live beside the transcript,
 *  never repeated here. */

import React from 'react';
import { ArrowRight, CircleCheck, ListTodo, MessagesSquare, Sparkles, type LucideIcon } from 'lucide-react';
import type { ActionItem, StructuredSummary } from '@shared/types';
import { EmptyState, Markdown } from '@shared/components';
import { Chip, Text, TopicLead, TopicLine, TopicSection, cn } from '@shared/ui';
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

const OverviewCard: React.FC<{ overview: string }> = ({ overview }) => <TopicLead title={SUMMARY.copy.overview}>{overview}</TopicLead>;

/** One section: its heading and count, then its lines. */
const Topic: React.FC<{ section: SectionKey; count: number; children: React.ReactNode }> = ({ section, count, children }) => (
  <TopicSection id={sectionId(section)} title={SECTIONS[section].title} icon={SECTIONS[section].icon} count={count}>{children}</TopicSection>
);

const ListCard: React.FC<{ section: SectionKey; items?: string[] }> = ({ section, items }) => {
  if (!items || items.length === 0) return null;
  return (
    <Topic section={section} count={items.length}>
      {items.map((item, idx) => <TopicLine key={idx}>{item}</TopicLine>)}
    </Topic>
  );
};

/** A due date as the Mac shows short dates ("21 Nov"); a YYYY-MM-DD day is read as local midnight, never UTC. */
const dueLabel = (dueDate: string): string => formatShortDate(`${dueDate}T00:00`) || dueDate;

const ActionsCard: React.FC<{ items?: ActionItem[] }> = ({ items }) => {
  if (!items || items.length === 0) return null;
  const hidden = items.length - SUMMARY.actionPreview;
  return (
    <Topic section="actions" count={items.length}>
      {items.slice(0, SUMMARY.actionPreview).map((item) => (
        <TopicLine
          key={item.id}
          trailing={(item.owner || item.dueDate) && <>{item.owner && <Chip label={item.owner} />}{item.dueDate && <Chip label={dueLabel(item.dueDate)} />}</>}
        >
          {item.text}
        </TopicLine>
      ))}
      {hidden > 0 && <li><Text variant="helper" tone="muted">{SUMMARY.copy.more(hidden, TODOS_CONFIG.title)}</Text></li>}
    </Topic>
  );
};

const Structured: React.FC<{ summary: StructuredSummary }> = ({ summary }) => {
  // decisions and action items side by side when both are there; either alone takes the full width
  const pair = (summary.decisionsMade?.length ?? 0) > 0 && (summary.actionItems?.length ?? 0) > 0;
  return (
    <>
      {summary.overview && <OverviewCard overview={summary.overview} />}
      <div className={cn('grid gap-3 empty:hidden', pair && 'md:grid-cols-2')}>
        <ListCard section="decisions" items={summary.decisionsMade} />
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

/** In place of the summary while it is being written: the overview it will fill, its text shimmering, and what runs now. */
export const SummaryWriting: React.FC<{ label: string }> = ({ label }) => (
  <div role="status" className="space-y-2">
    <TopicLead title={SUMMARY.copy.overview} shimmer>{SUMMARY.copy.writingPlaceholder}</TopicLead>
    <Text as="p" variant="helper" tone="muted">{label}</Text>
  </div>
);
