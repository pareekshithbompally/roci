import React from 'react';
import type { ActionItem, StructuredSummary } from '@shared/types';
import { Sparkles } from 'lucide-react';
import { EmptyState, Markdown } from '@shared/components';
import { Surface, Text } from '@shared/ui';
import { TODOS_CONFIG } from '@config/todos.config';

interface SummaryViewProps {
  summary: string;
  structuredSummary?: StructuredSummary;
  timestamp?: number;
  title?: string;
}

/** Action items shown inline; the rest live in the To-dos tab. */
const ACTION_PREVIEW_LIMIT = 5;

const Overview: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Surface variant="subtle" radius="lg" className="p-5 space-y-2">
    <Text as="h3" variant="label" tone="muted">Overview</Text>
    <Text as="div" variant="reading" className="leading-relaxed">{children}</Text>
  </Surface>
);

const SummarySection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section>
    <Text as="h3" variant="title" className="mb-3">{title}</Text>
    <ul className="space-y-2">{children}</ul>
  </section>
);

const Bullet: React.FC<{ children: React.ReactNode; meta?: string }> = ({ children, meta }) => (
  <li className="flex items-start gap-3">
    <Text variant="reading" tone="faint" className="shrink-0">•</Text>
    <div className="flex-1 min-w-0">
      <Text as="p" variant="reading" className="leading-relaxed">{children}</Text>
      {meta && <Text as="p" variant="helper" tone="muted" className="mt-0.5">{meta}</Text>}
    </div>
  </li>
);

const BulletSection: React.FC<{ title: string; items?: string[] }> = ({ title, items }) => {
  if (!items || items.length === 0) return null;
  return (
    <SummarySection title={title}>
      {items.map((item, idx) => <Bullet key={idx}>{item}</Bullet>)}
    </SummarySection>
  );
};

function actionMeta(item: ActionItem, withOwner: boolean): string {
  return [withOwner && item.owner && `Owner: ${item.owner}`, item.dueDate && `Due: ${item.dueDate}`]
    .filter(Boolean)
    .join(' · ');
}

const ActionItemsSection: React.FC<{ items?: ActionItem[]; withOwner: boolean }> = ({ items, withOwner }) => {
  if (!items || items.length === 0) return null;
  const hidden = items.length - ACTION_PREVIEW_LIMIT;
  return (
    <SummarySection title={`Action Items (${items.length})`}>
      {items.slice(0, ACTION_PREVIEW_LIMIT).map((item) => (
        <Bullet key={item.id} meta={actionMeta(item, withOwner)}>{item.text}</Bullet>
      ))}
      {hidden > 0 && (
        <li className="pt-1">
          <Text variant="helper" tone="muted">+{hidden} more items (view in {TODOS_CONFIG.title} tab)</Text>
        </li>
      )}
    </SummarySection>
  );
};

/** Renders structured summary fields directly; falls back to raw markdown for tldr/notes data. */
const SummaryView: React.FC<SummaryViewProps> = ({ summary, structuredSummary }) => {
  // No summary data at all
  if (!summary && !structuredSummary) {
    return <EmptyState icon={Sparkles} message="No summary available" />;
  }

  // No structured summary — render raw markdown
  if (!structuredSummary) {
    return <Markdown content={summary} />;
  }

  // New structured fields available
  const hasNewFields = structuredSummary.overview || structuredSummary.keyDiscussionPoints;

  if (hasNewFields) {
    return (
      <div className="max-w-4xl space-y-6">
        {structuredSummary.overview && <Overview>{structuredSummary.overview}</Overview>}
        <BulletSection title="Key Discussion Points" items={structuredSummary.keyDiscussionPoints} />
        <BulletSection title="Decisions Made" items={structuredSummary.decisionsMade} />
        <ActionItemsSection items={structuredSummary.actionItems} withOwner />
        <BulletSection title="Next Steps" items={structuredSummary.nextSteps} />
      </div>
    );
  }

  // Legacy fallback: tldr/notes fields
  if (!structuredSummary.tldr && !structuredSummary.notes) {
    return <Markdown content={summary} />;
  }

  return (
    <div className="max-w-4xl space-y-6">
      {structuredSummary.tldr && structuredSummary.tldr !== '<None Found>' && (
        <Overview><Markdown content={structuredSummary.tldr} /></Overview>
      )}
      {structuredSummary.notes && structuredSummary.notes !== '<None Found>' && (
        <Markdown content={structuredSummary.notes} />
      )}
      <ActionItemsSection items={structuredSummary.actionItems} withOwner={false} />
    </div>
  );
};

export default SummaryView;
