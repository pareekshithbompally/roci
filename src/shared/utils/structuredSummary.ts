/** A stored meeting summary as the view's fields; action items get ids from their place, so the same summary always reads the
 *  same (no remount, no re-render on an unrelated write). */

import type { MeetingSummary, StructuredSummary } from '@shared/types';

export function structuredSummaryOf(summary: MeetingSummary): StructuredSummary {
  return {
    overview: summary.overview,
    keyDiscussionPoints: summary.keyDiscussionPoints,
    decisionsMade: summary.decisionsMade,
    actionItems: summary.actionItems.map((item, index) => ({ id: `action-${index}`, text: item.text, owner: item.owner, dueDate: item.dueDate, completed: false })),
    nextSteps: summary.nextSteps,
    enhancedNotes: summary.enhancedNotes,
  };
}
