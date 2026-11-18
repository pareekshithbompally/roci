/** One live-notes refresh with the Summary model: the notes, current bullets and new transcript in, the changed bullets out. */

import { generateText, Output, jsonSchema } from 'ai';
import { createModel } from './provider';
import { extractTokenUsage } from './types';
import { recordUsage } from '@extensions/usage';
import { LIVE_NOTES_PROMPT, LIVE_NOTES_SCHEMA, buildLiveNotesInput } from '@core/ai';
import type { LiveNotesChange, LiveNotesInput } from '@core/ai';
import type { ResolvedModel } from '@shared/utils/modelResolver';

const isChange = (value: unknown): value is LiveNotesChange =>
  typeof value === 'object' && value !== null && typeof (value as { text?: unknown }).text === 'string';

export async function refreshLiveNotes(args: LiveNotesInput & {
  resolved: ResolvedModel;
  /** The meeting, for the usage row. */
  meetingId: string;
  signal: AbortSignal;
}): Promise<LiveNotesChange[]> {
  const result = await generateText({
    model: createModel(args.resolved),
    instructions: LIVE_NOTES_PROMPT,
    prompt: buildLiveNotesInput(args),
    output: Output.object({ schema: jsonSchema(LIVE_NOTES_SCHEMA) }),
    abortSignal: args.signal,
  });
  recordUsage('summary', args.resolved, extractTokenUsage(result.usage), args.meetingId);
  const output = result.output as { bullets?: unknown } | null;
  return Array.isArray(output?.bullets) ? output.bullets.filter(isChange) : [];
}
