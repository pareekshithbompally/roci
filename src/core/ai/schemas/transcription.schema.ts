/** Output of meeting analysis (the Overview tab). Each field's description is the one place its content is defined:
 *  the model reads it through the schema, and the summary prompt lists it for models that ignore schemas. */

import type { MeetingSummary } from '@shared/types';

const list = (description: string) => ({ type: 'array' as const, items: { type: 'string' as const }, description });

const SUMMARY_SCHEMA = {
  type: 'object' as const,
  description: 'The meeting summary, section by section.',
  properties: {
    overview: {
      type: 'string' as const,
      description: '2–3 sentences: what the meeting was about and how it ended.',
    },
    keyDiscussionPoints: list('The main topics discussed, one per item, each with the key details or numbers.'),
    decisionsMade: list('Decisions that were agreed, one per item, with the reason when one was given. Empty if none.'),
    actionItems: {
      type: 'array' as const,
      description: 'Tasks someone agreed to do. Empty if none.',
      items: {
        type: 'object' as const,
        properties: {
          text: { type: 'string' as const, description: 'The task as a short instruction: "Send the Q3 report to Priya".' },
          owner: { type: 'string' as const, description: 'Who will do it, only when the meeting says.' },
          dueDate: { type: 'string' as const, description: 'When it is due, YYYY-MM-DD, only when the meeting gives a date or day.' },
        },
        required: ['text'] as const,
        additionalProperties: false,
      },
    },
    nextSteps: list('What happens after this meeting that is not already an action item. Empty if none.'),
  },
  required: ['overview', 'keyDiscussionPoints', 'decisionsMade', 'actionItems', 'nextSteps'] as const,
  additionalProperties: false,
};

/** The analysis schema; with the user's categories, `categories` may only hold those names. */
export function transcriptionSchema(categories: string[]) {
  const category =
    categories.length > 0 ? { type: 'string' as const, enum: categories } : { type: 'string' as const };
  return {
    type: 'object' as const,
    properties: {
      title: { type: 'string' as const, description: 'A title of at most 6 words naming the main topic.' },
      summary: SUMMARY_SCHEMA,
      categories: {
        type: 'array' as const,
        items: category,
        description: categories.length > 0 ? 'One or more of the listed categories that fit.' : 'One to three short categories that fit.',
      },
    },
    required: ['title', 'summary', 'categories'] as const,
    additionalProperties: false,
  };
}

export interface AnalysisResult {
  title: string;
  summary: MeetingSummary;
  categories: string[];
}
