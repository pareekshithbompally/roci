import React from 'react';
import { StructuredSummary } from '../types';
import CleanMarkdown from './CleanMarkdown';
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
 * Displays a structured summary with:
 * - Meeting Overview section
 * - Key Discussion Points
 * - Decisions Made
 * - Action items preview
 * - Next Steps
 * - Clean markdown formatting
 */
const SummaryView: React.FC<SummaryViewProps> = ({ 
  summary, 
  structuredSummary,
  timestamp,
  title
}) => {
  // If no structured summary, render the raw markdown directly
  if (!structuredSummary || (!structuredSummary.tldr && !structuredSummary.notes)) {
    return (
      <div className="prose prose-zinc dark:prose-invert max-w-none">
        <CleanMarkdown content={summary} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* TL;DR / Meeting Overview Section */}
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

      {/* Notes / Key Discussion Points Section */}
      {structuredSummary.notes && structuredSummary.notes !== '<None Found>' && (
        <div className={`prose prose-zinc dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight ${TYPOGRAPHY_CLASSES.summaryBody}`}>
          <CleanMarkdown content={structuredSummary.notes} />
        </div>
      )}

      {/* Action Items Preview */}
      {structuredSummary.actionItems && structuredSummary.actionItems.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl p-6">
          <h3 className={`${TYPOGRAPHY_CLASSES.summaryTitle} font-bold uppercase tracking-wide text-amber-900 dark:text-amber-100 mb-4`}>
            Action Items ({structuredSummary.actionItems.length})
          </h3>
          <div className="space-y-3">
            {structuredSummary.actionItems.slice(0, 5).map((item) => (
              <div key={item.id} className={`flex items-start gap-3 ${TYPOGRAPHY_CLASSES.summaryBody}`}>
                <span className="text-amber-600 dark:text-amber-400 mt-1">•</span>
                <div className="flex-1">
                  <p className="text-amber-900 dark:text-amber-100 leading-relaxed">{item.text}</p>
                  {item.dueDate && (
                    <span className="text-xs text-amber-700 dark:text-amber-300 mt-1 block">
                      Due: {item.dueDate}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {structuredSummary.actionItems.length > 5 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 pt-2 font-medium">
                +{structuredSummary.actionItems.length - 5} more items (view in To-Do tab)
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SummaryView;
