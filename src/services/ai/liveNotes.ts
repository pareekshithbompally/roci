/** One live-notes update with the Summary model: the user's notes, the points so far and the new transcript in; the changes out. */

import { generateText, Output, jsonSchema } from 'ai';
import { createModel } from './provider';
import { extractTokenUsage } from './types';
import { recordUsage } from '@extensions/usage';
import { LIVE_NOTES_PROMPT, buildLiveNotesInput, liveNotesSchema } from '@core/ai';
import type { LiveNotesChange, LiveNotesInput } from '@core/ai';
import type { ResolvedModel } from '@shared/utils/modelResolver';

export interface LiveNotesReply {
  filled?: LiveNotesChange[];
  points?: LiveNotesChange[];
}

const isChange = (value: unknown): value is LiveNotesChange =>
  typeof value === 'object' && value !== null && typeof (value as { text?: unknown }).text === 'string';

const changes = (value: unknown): LiveNotesChange[] => (Array.isArray(value) ? value.filter(isChange) : []);

export async function refreshLiveNotes(args: {
  input: LiveNotesInput;
  resolved: ResolvedModel;
  /** The meeting, for the usage row. */
  meetingId: string;
  signal: AbortSignal;
}): Promise<LiveNotesReply> {
  const result = await generateText({
    model: createModel(args.resolved),
    instructions: LIVE_NOTES_PROMPT,
    prompt: buildLiveNotesInput(args.input),
    output: Output.object({ schema: jsonSchema(liveNotesSchema(args.input.notes.map((n) => n.id))) }),
    abortSignal: args.signal,
  });
  recordUsage('summary', args.resolved, extractTokenUsage(result.usage), args.meetingId);
  const output = result.output as { filled?: unknown; points?: unknown } | null;
  return { filled: changes(output?.filled), points: changes(output?.points) };
}
