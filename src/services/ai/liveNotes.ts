/** One live-notes update with the Summary model, through the one structured call: the user's notes, the points so far and the
 *  new transcript in; the changes out. */

import { LIVE_NOTES_PROMPT, buildLiveNotesInput, liveNotesSchema } from '@core/ai';
import type { LiveNotesChange, LiveNotesInput } from '@core/ai';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import { generateStructured } from './structured';

export interface LiveNotesReply {
  filled: LiveNotesChange[];
  points: LiveNotesChange[];
}

export async function refreshLiveNotes(args: {
  input: LiveNotesInput;
  resolved: ResolvedModel;
  /** The meeting, for the usage row. */
  meetingId: string;
  signal: AbortSignal;
}): Promise<LiveNotesReply> {
  const reply: { points: LiveNotesChange[]; filled?: LiveNotesChange[] } = await generateStructured({
    job: 'liveNotes',
    model: args.resolved,
    instructions: LIVE_NOTES_PROMPT,
    prompt: buildLiveNotesInput(args.input),
    schema: liveNotesSchema(args.input.notes.map((n) => n.id)),
    usage: { category: 'liveNotes', sessionId: args.meetingId },
    signal: args.signal,
  });
  return { filled: reply.filled ?? [], points: reply.points };
}
