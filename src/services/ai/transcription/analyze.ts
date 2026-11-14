import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { generateText, Output, jsonSchema } from 'ai';
import { buildTranscriptionRequest, formatTemporalContext } from '@core/ai';
import { createModel } from '@services/ai/provider';
import { extractTokenUsage } from '@services/ai/types';
import { recordUsage } from '@extensions/usage';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import type { MeetingContext } from '@core/ai/prompts/transcription.prompt';
import type { AnalysisResult } from '@core/ai/schemas/transcription.schema';
import { isContextWindowError, summaryError } from '@services/ai/apple/contextWindow';
import { contextTokensFor, excerptTranscript, transcriptBudget } from './excerpt';


/** Title, summary, action items and categories from a transcript (the Summary model); logs its usage. */
export async function analyzeTranscript(args: {
  transcript: string;
  categories: string[];
  resolved: ResolvedModel;
  meetingContext?: MeetingContext;
  /** The meeting this summary belongs to, for the usage row. */
  meetingId?: string;
}): Promise<AnalysisResult> {
  const config = buildTranscriptionRequest({
    categories: args.categories,
    meetingContext: args.meetingContext,
    temporalContext: formatTemporalContext(),
    supportsStructuredOutput: true,
  });

  const model = createModel(args.resolved);
  const run = (budget: number | null) => generateText({
    model,
    instructions: config.prompt,
    prompt: `Transcript:\n${excerptTranscript(args.transcript, budget)}`,
    output: Output.object({ schema: jsonSchema(config.outputSchema!.schema) }),
  });

  // Known-window models get an excerpt when needed; if it still doesn't fit, one shorter try (HEX).
  const budget = transcriptBudget(await contextTokensFor(args.resolved), config.prompt);
  const result = await run(budget)
    .catch((error: unknown) => {
      if (budget === null || !isContextWindowError(error)) throw error;
      return run(Math.floor(budget * TRANSCRIPTION_CONFIG.summaryBudget.retryShare));
    })
    .catch((error: unknown) => { throw summaryError(error); });

  recordUsage('summary', args.resolved, extractTokenUsage(result.usage), args.meetingId);
  return result.output as AnalysisResult;
}
