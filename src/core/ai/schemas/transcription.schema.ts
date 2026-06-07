import type { MeetingSummary } from '@shared/types';

export const TRANSCRIPTION_SCHEMA = {
  type: 'object' as const,
  properties: {
    title: {
      type: 'string',
      description: 'Concise descriptive title, max 6 words.',
    },
    summary: {
      type: 'object' as const,
      description: 'Structured meeting summary with discrete sections.',
      properties: {
        overview: {
          type: 'string',
          description: '2-3 sentence executive summary of what was discussed and main outcomes.',
        },
        keyDiscussionPoints: {
          type: 'array' as const,
          items: { type: 'string' },
          description: 'Array of major topics discussed, each with key details.',
        },
        decisionsMade: {
          type: 'array' as const,
          items: { type: 'string' },
          description: 'Array of decisions made. Use ["No formal decisions were recorded"] if none.',
        },
        actionItems: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              text: { type: 'string', description: 'The action item task description.' },
              owner: { type: 'string', description: 'Person responsible, if mentioned.' },
              dueDate: { type: 'string', description: 'Due date, if mentioned.' },
            },
            required: ['text'] as const,
          },
          description: 'Array of action items with optional owner and due date.',
        },
        nextSteps: {
          type: 'array' as const,
          items: { type: 'string' },
          description: 'Array of follow-up items and what happens next.',
        },
      },
      required: ['overview', 'keyDiscussionPoints', 'decisionsMade', 'actionItems', 'nextSteps'] as const,
    },
    categories: {
      type: 'array',
      items: { type: 'string' },
      description: 'One or more categories from the provided list.',
    },
  },
  required: ['title', 'summary', 'categories'],
  additionalProperties: false,
} as const;

export interface AnalysisResult {
  title: string;
  summary: MeetingSummary;
  categories: string[];
}
