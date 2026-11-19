/** Output of meeting analysis (the Summary tab). Each field's description is the one place its content is defined:
 *  the model reads it through the schema, and the summary prompt lists it for models that ignore schemas. */

import { z } from 'zod';
import type { MeetingSummary } from '@shared/types';

const list = (description: string) => ({ type: 'array' as const, items: { type: 'string' as const }, description });

/** The summary schema; with the user's notes it also asks for each note filled in. */
const summarySchema = (withNotes: boolean) => ({
  type: 'object' as const,
  description: 'The meeting summary, section by section.',
  properties: {
    overview: {
      type: 'string' as const,
      description: '2–3 sentences of plain prose: what the meeting was about, what came of it, and how it ended. No list, no heading.',
    },
    keyDiscussionPoints: list('Key points: the main topics, at most 6, one short sentence each with its specifics (names, numbers). Not decisions, tasks or next steps: those have their own fields.'),
    decisionsMade: list('Decisions that were agreed, one short sentence each, with the reason when one was given. Empty if none.'),
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
    nextSteps: list('What happens after this meeting that no one took on as an action item, one short sentence each. Empty if none.'),
    ...(withNotes && {
      enhancedNotes: list("The user's notes filled in: exactly one item per note, in the notes' order. Each item is the note's point, then what was said about it (names, numbers, dates); if nothing was said, the note written out clearly."),
    }),
  },
  required: [
    'overview', 'keyDiscussionPoints', 'decisionsMade', 'actionItems', 'nextSteps', ...(withNotes ? ['enhancedNotes' as const] : []),
  ],
  additionalProperties: false,
});

/** The analysis schema; with the user's categories, `categories` may only hold those names; with their notes, the summary
 *  fills each one in. */
export function transcriptionSchema(categories: string[], withNotes = false) {
  const category =
    categories.length > 0 ? { type: 'string' as const, enum: categories } : { type: 'string' as const };
  return {
    type: 'object' as const,
    properties: {
      title: { type: 'string' as const, description: 'A title of at most 6 words naming the main topic.' },
      summary: summarySchema(withNotes),
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

/** A list of words; anything else (missing, null, wrong shape) reads as empty, and blank items are dropped. */
const words = z.array(z.unknown()).catch([]).transform((items) =>
  items.filter((item): item is string => typeof item === 'string' && item.trim() !== ''));

const optionalWord = z.string().optional().catch(undefined);

const actionItems = z.array(z.unknown()).catch([]).transform((items) => items.flatMap((item) => {
  const parsed = z.object({ text: z.string().min(1), owner: optionalWord, dueDate: optionalWord }).safeParse(item);
  return parsed.success ? [parsed.data] : [];
}));

const summaryFields = z.object({
  overview: z.unknown(),
  keyDiscussionPoints: z.unknown(),
  decisionsMade: z.unknown(),
  actionItems: z.unknown(),
  nextSteps: z.unknown(),
  enhancedNotes: z.unknown(),
}).partial().catch({});

/** Any summary (a model's reply or a stored one) as a whole `MeetingSummary`: every list present, so no reader can crash on a
 *  field a model left out. */
export function parseMeetingSummary(raw: unknown): MeetingSummary {
  const fields = summaryFields.parse(raw ?? {});
  const notes = fields.enhancedNotes === undefined ? undefined : words.parse(fields.enhancedNotes);
  return {
    overview: z.string().catch('').parse(fields.overview).trim(),
    keyDiscussionPoints: words.parse(fields.keyDiscussionPoints),
    decisionsMade: words.parse(fields.decisionsMade),
    actionItems: actionItems.parse(fields.actionItems),
    nextSteps: words.parse(fields.nextSteps),
    ...(notes && { enhancedNotes: notes }),
  };
}

/** A model's analysis reply as a whole `AnalysisResult`; a reply with no summary at all is an error the user can retry. */
export function parseAnalysis(raw: unknown): AnalysisResult {
  const reply = z.object({ title: z.string().catch(''), summary: z.unknown(), categories: words }).catch({ title: '', summary: undefined, categories: [] }).parse(raw);
  const summary = parseMeetingSummary(reply.summary);
  const empty = !summary.overview && summary.keyDiscussionPoints.length === 0 && summary.actionItems.length === 0;
  if (empty) throw new Error("The model's reply had no summary in it.");
  return { title: reply.title.trim(), summary, categories: reply.categories };
}
