/** A meeting summary as Markdown, in the Summary tab's order: the one text form of a summary (copy, export, search, chat). */

import type { MeetingSummary } from '@shared/types';

const list = (title: string, items: string[]): string | null =>
  items.length > 0 ? `## ${title}\n${items.map((item) => `- ${item}`).join('\n')}` : null;

const actionLine = (item: MeetingSummary['actionItems'][number]): string =>
  [item.text, item.owner && `Owner: ${item.owner}`, item.dueDate && `Due: ${item.dueDate}`].filter(Boolean).join(' - ');

export function summaryMarkdown(summary: MeetingSummary | undefined): string {
  if (!summary) return '';
  return [
    summary.overview || null,
    list('Decisions', summary.decisionsMade),
    list('Action items', summary.actionItems.map(actionLine)),
    list('Discussed', summary.keyDiscussionPoints),
    list('Next steps', summary.nextSteps),
    list('Your notes, enhanced', summary.enhancedNotes ?? []),
  ].filter((part): part is string => part !== null).join('\n\n');
}
