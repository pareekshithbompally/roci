/** Output of meeting analysis (the Summary tab), defined once: each field's description is the one place its content is
 *  defined (the model reads it through the schema, and the prompt lists it for models that ignore schemas); replies and stored
 *  summaries are read against the same schema. */

import { z } from 'zod';
import type { MeetingSummary } from '@shared/types';
import type { MeetingKnowledge } from '@shared/types/native';
import { ENTITY_KINDS } from '@config/knowledge.config';
import { readReply } from './reply';

const line = z.string().trim().min(1);
const lines = (description: string) => z.array(line).describe(description);

/** The summary; with the user's notes it also fills each one in. */
export function meetingSummarySchema(withNotes: boolean) {
  const base = z.strictObject({
    overview: z.string().trim().describe('2–3 sentences of plain prose: what the meeting was about, what came of it, and how it ended. No list, no heading.'),
    keyDiscussionPoints: lines('Key points: the main topics, at most 6, one short sentence each with its specifics (names, numbers). Not decisions, tasks or next steps: those have their own fields.'),
    decisionsMade: lines('Decisions that were agreed, one short sentence each, with the reason when one was given. Empty if none.'),
    actionItems: z.array(z.strictObject({
      text: line.describe('The task as a short instruction: "Send the Q3 report to Priya".'),
      owner: z.string().trim().min(1).optional().describe('Who will do it, only when the meeting says.'),
      dueDate: z.string().trim().min(1).optional().describe('When it is due, YYYY-MM-DD, only when the meeting gives a date or day.'),
    })).describe('Tasks someone agreed to do. Empty if none.'),
    nextSteps: lines('What happens after this meeting that no one took on as an action item, one short sentence each. Empty if none.'),
  }).describe('The meeting summary, section by section.');
  if (!withNotes) return base;
  return base.extend({
    enhancedNotes: lines("The user's notes filled in: exactly one item per note, in the notes' order. Each item is the note's point, then what was said about it (names, numbers, dates); if nothing was said, the note written out clearly."),
  });
}

/** What the meeting was about, for the knowledge graph: who and what it discussed, and what it stated between them. */
const knowledgeSchema = z.strictObject({
  entities: z.array(z.strictObject({
    name: line.describe('The name as the meeting used it: "Priya Raman", "Acme", "Q3 Launch", "Pricing".'),
    entity_type: z.enum(ENTITY_KINDS).describe('topic: a subject that may come up in later meetings, not a sentence.'),
  })).describe('The people, organizations, projects, events and topics this meeting was about, each once, at most 12.'),
  relations: z.array(z.strictObject({
    from: line.describe('One of the entities, by name.'),
    relation: line.describe('Active voice, 1–4 words: "leads", "works at", "owns".'),
    to: line.describe('Another of the entities, by name.'),
  })).describe('Lasting facts the meeting stated between two of the entities. Empty if none.'),
}).describe('Who and what the meeting was about.');

/** The analysis: a title, the summary, categories (only the user's own when they have some), and what it was about. */
export function analysisSchema(categories: string[], withNotes: boolean) {
  const [first, ...rest] = categories;
  const category = first ? z.enum([first, ...rest]) : line;
  return z.strictObject({
    title: z.string().trim().describe('A title of at most 6 words naming the main topic.'),
    summary: meetingSummarySchema(withNotes),
    categories: z.array(category).describe(categories.length > 0 ? 'One or more of the listed categories that fit.' : 'One to three short categories that fit.'),
    knowledge: knowledgeSchema,
  });
}

/** What an analysis gives back (either schema shape, with or without the user's notes). */
export interface AnalysisResult {
  title: string;
  summary: MeetingSummary;
  categories: string[];
  knowledge: MeetingKnowledge;
}

/** A stored summary as a whole `MeetingSummary`: every list present, so no reader can crash on a field a model left out. */
export function parseMeetingSummary(raw: unknown): MeetingSummary {
  return readReply(meetingSummarySchema(true), raw);
}

/** Whether a summary says anything at all (a reply with no summary in it is a failure to retry, not an empty meeting). */
export function hasSummary(summary: MeetingSummary): boolean {
  return summary.overview !== '' || summary.keyDiscussionPoints.length > 0 || summary.actionItems.length > 0;
}
