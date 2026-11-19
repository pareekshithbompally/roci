/** A finished transcript → title, summary, action items and categories, through the one structured call; a transcript too
 *  long for the model is excerpted to fit (and, if it still doesn't, once more to a shorter share). */

import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { buildTranscriptionRequest, formatTemporalContext, hasSummary, type AnalysisResult } from '@core/ai';
import type { MeetingContext, UserNote } from '@core/ai/prompts/transcription.prompt';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import { generateStructured } from '@services/ai/structured';
import { AiError } from '@services/ai/errors';
import { contextTokensFor, excerptTranscript, transcriptBudget } from './excerpt';

export async function analyzeTranscript(args: {
  transcript: string;
  categories: string[];
  resolved: ResolvedModel;
  meetingContext?: MeetingContext;
  /** The user's notes from the meeting. */
  userNotes?: UserNote[];
  /** The meeting this summary belongs to, for the usage row. */
  meetingId?: string;
  /** Cancels the request. */
  signal?: AbortSignal;
}): Promise<AnalysisResult> {
  const { prompt: instructions, schema } = buildTranscriptionRequest({
    categories: args.categories,
    meetingContext: args.meetingContext,
    userNotes: args.userNotes,
    temporalContext: formatTemporalContext(),
  });
  const budget = transcriptBudget(await contextTokensFor(args.resolved), instructions);
  const promptAt = (limit: number | null) => `Transcript:\n${excerptTranscript(args.transcript, limit)}`;
  const shorterBudget = budget === null ? null : Math.floor(budget * TRANSCRIPTION_CONFIG.summaryBudget.retryShare);

  const analysis = await generateStructured({
    job: 'summary',
    model: args.resolved,
    instructions,
    prompt: promptAt(budget),
    schema,
    usage: { category: 'summary', sessionId: args.meetingId },
    signal: args.signal,
    shorter: () => (shorterBudget === null ? null : promptAt(shorterBudget)),
  });
  if (!hasSummary(analysis.summary)) throw new AiError('badReply', "The Summary model's reply had no summary in it. Try again.");
  return analysis;
}
