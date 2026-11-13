import React from 'react';
import type { StructuredSummary } from '@shared/types';
import { Sparkles } from 'lucide-react';
import CleanMarkdown from '@shared/components/CleanMarkdown';
import EmptyState from '@shared/components/EmptyState';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';

interface SummaryViewProps {
  summary: string;
  structuredSummary?: StructuredSummary;
  timestamp?: number;
  title?: string;
}

/**
 * SummaryView Component
 *
 * Renders structured summary fields directly — no regex/markdown parsing needed.
 * - Blue banner: overview
 * - Bullet lists: keyDiscussionPoints, decisionsMade, nextSteps
 * - Amber banner: action items with owner/dueDate
 *
 * Falls back to raw markdown for legacy data (tldr/notes fields).
 */
const SummaryView: React.FC<SummaryViewProps> = ({
  summary,
  structuredSummary,
  timestamp,
  title
}) => {
  // No summary data at all
  if (!summary && !structuredSummary) {
    return (
      <div className="flex flex-col min-h-full items-center justify-center">
        <EmptyState icon={Sparkles} message="No summary available" />
      </div>
    );
  }

  // No structured summary — render raw markdown
  if (!structuredSummary) {
    return (
      <div className="prose prose-zinc dark:prose-invert max-w-none">
        <CleanMarkdown content={summary} />
      </div>
    );
  }

  // New structured fields available
  const hasNewFields = structuredSummary.overview || structuredSummary.keyDiscussionPoints;

  if (hasNewFields) {
    return (
      <div className="max-w-4xl space-y-6">
        {/* Meeting Overview — blue banner */}
        {structuredSummary.overview && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl p-6">
            <h3 className={`${TYPOGRAPHY_CLASSES.summaryTitle} font-bold uppercase tracking-wide text-blue-900 dark:text-blue-100 mb-4`}>
              Meeting Overview
            </h3>
            <p className={`${TYPOGRAPHY_CLASSES.summaryBody} text-blue-900 dark:text-blue-100 leading-relaxed`}>
              {structuredSummary.overview}
            </p>
          </div>
        )}

        {/* Key Discussion Points */}
        {structuredSummary.keyDiscussionPoints && structuredSummary.keyDiscussionPoints.length > 0 && (
          <div>
            <h3 className={`${TYPOGRAPHY_CLASSES.summaryTitle} font-bold text-paper-900 dark:text-night-100 mb-3`}>
              Key Discussion Points
            </h3>
            <ul className="space-y-2">
              {structuredSummary.keyDiscussionPoints.map((point, idx) => (
                <li key={idx} className={`flex items-start gap-3 ${TYPOGRAPHY_CLASSES.summaryBody}`}>
                  <span className="text-paper-500 dark:text-night-400 mt-1 shrink-0">•</span>
                  <span className="text-paper-800 dark:text-night-200 leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Decisions Made */}
        {structuredSummary.decisionsMade && structuredSummary.decisionsMade.length > 0 && (
          <div>
            <h3 className={`${TYPOGRAPHY_CLASSES.summaryTitle} font-bold text-paper-900 dark:text-night-100 mb-3`}>
              Decisions Made
            </h3>
            <ul className="space-y-2">
              {structuredSummary.decisionsMade.map((decision, idx) => (
                <li key={idx} className={`flex items-start gap-3 ${TYPOGRAPHY_CLASSES.summaryBody}`}>
                  <span className="text-paper-500 dark:text-night-400 mt-1 shrink-0">•</span>
                  <span className="text-paper-800 dark:text-night-200 leading-relaxed">{decision}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action Items */}
        {structuredSummary.actionItems && structuredSummary.actionItems.length > 0 && (
          <div>
            <h3 className={`${TYPOGRAPHY_CLASSES.summaryTitle} font-bold text-paper-900 dark:text-night-100 mb-3`}>
              Action Items ({structuredSummary.actionItems.length})
            </h3>
            <ul className="space-y-2">
              {structuredSummary.actionItems.slice(0, 5).map((item) => (
                <li key={item.id} className={`flex items-start gap-3 ${TYPOGRAPHY_CLASSES.summaryBody}`}>
                  <span className="text-paper-500 dark:text-night-400 mt-1 shrink-0">•</span>
                  <div className="flex-1">
                    <span className="text-paper-800 dark:text-night-200 leading-relaxed">{item.text}</span>
                    {(item.owner || item.dueDate) && (
                      <span className="text-xs text-paper-500 dark:text-night-400 mt-1 block">
                        {item.owner && `Owner: ${item.owner}`}
                        {item.owner && item.dueDate && ' · '}
                        {item.dueDate && `Due: ${item.dueDate}`}
                      </span>
                    )}
                  </div>
                </li>
              ))}
              {structuredSummary.actionItems.length > 5 && (
                <li className={`text-xs text-paper-500 dark:text-night-400 pt-1 ${TYPOGRAPHY_CLASSES.summaryBody}`}>
                  +{structuredSummary.actionItems.length - 5} more items (view in To-Do tab)
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Next Steps */}
        {structuredSummary.nextSteps && structuredSummary.nextSteps.length > 0 && (
          <div>
            <h3 className={`${TYPOGRAPHY_CLASSES.summaryTitle} font-bold text-paper-900 dark:text-night-100 mb-3`}>
              Next Steps
            </h3>
            <ul className="space-y-2">
              {structuredSummary.nextSteps.map((step, idx) => (
                <li key={idx} className={`flex items-start gap-3 ${TYPOGRAPHY_CLASSES.summaryBody}`}>
                  <span className="text-paper-500 dark:text-night-400 mt-1 shrink-0">•</span>
                  <span className="text-paper-800 dark:text-night-200 leading-relaxed">{step}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // Legacy fallback: tldr/notes fields
  if (!structuredSummary.tldr && !structuredSummary.notes) {
    return (
      <div className="prose prose-zinc dark:prose-invert max-w-none">
        <CleanMarkdown content={summary} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {structuredSummary.tldr && structuredSummary.tldr !== '<None Found>' && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl p-6">
          <h3 className={`${TYPOGRAPHY_CLASSES.summaryTitle} font-bold uppercase tracking-wide text-blue-900 dark:text-blue-100 mb-4`}>
            Meeting Overview
          </h3>
          <div className={`${TYPOGRAPHY_CLASSES.summaryBody} text-blue-900 dark:text-blue-100 leading-relaxed`}>
            <CleanMarkdown content={structuredSummary.tldr} />
          </div>
        </div>
      )}

      {structuredSummary.notes && structuredSummary.notes !== '<None Found>' && (
        <div className={`prose prose-zinc dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight ${TYPOGRAPHY_CLASSES.summaryBody}`}>
          <CleanMarkdown content={structuredSummary.notes} />
        </div>
      )}

      {structuredSummary.actionItems && structuredSummary.actionItems.length > 0 && (
        <div>
          <h3 className={`${TYPOGRAPHY_CLASSES.summaryTitle} font-bold text-paper-900 dark:text-night-100 mb-3`}>
            Action Items ({structuredSummary.actionItems.length})
          </h3>
          <ul className="space-y-2">
            {structuredSummary.actionItems.slice(0, 5).map((item) => (
              <li key={item.id} className={`flex items-start gap-3 ${TYPOGRAPHY_CLASSES.summaryBody}`}>
                <span className="text-paper-500 dark:text-night-400 mt-1 shrink-0">•</span>
                <div className="flex-1">
                  <span className="text-paper-800 dark:text-night-200 leading-relaxed">{item.text}</span>
                  {item.dueDate && (
                    <span className="text-xs text-paper-500 dark:text-night-400 mt-1 block">
                      Due: {item.dueDate}
                    </span>
                  )}
                </div>
              </li>
            ))}
            {structuredSummary.actionItems.length > 5 && (
              <li className={`text-xs text-paper-500 dark:text-night-400 pt-1 ${TYPOGRAPHY_CLASSES.summaryBody}`}>
                +{structuredSummary.actionItems.length - 5} more items (view in To-Do tab)
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SummaryView;
