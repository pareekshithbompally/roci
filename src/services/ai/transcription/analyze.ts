import { generateText, Output, jsonSchema } from 'ai';
import { buildTranscriptionRequest, formatTemporalContext } from '@core/ai';
import { createModel } from '@services/ai/provider';
import { extractTokenUsage } from '@services/ai/types';
import type { TokenUsage } from '@services/ai/types';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import type { MeetingContext } from '@core/ai/prompts/transcription.prompt';
import type { AnalysisResult } from '@core/ai/schemas/transcription.schema';
import { contextTokensFor, isContextWindowError, summaryError } from '@services/ai/apple/contextWindow';
import { excerptTranscript, transcriptBudget } from './excerpt';

/** A second try after "didn't fit" uses this share of the first budget. */
const RETRY_BUDGET_SHARE = 0.6;

export async function analyzeTranscript(args: {
  transcript: string;
  categories: string[];
  resolved: ResolvedModel;
  meetingContext?: MeetingContext;
}): Promise<{ result: AnalysisResult; usage?: TokenUsage }> {
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

  // Small-window models get an excerpt; if it still doesn't fit, one shorter try (HEX).
  const budget = transcriptBudget(await contextTokensFor(args.resolved), config.prompt);
  const result = await run(budget)
    .catch((error: unknown) => {
      if (budget === null || !isContextWindowError(error)) throw error;
      return run(Math.floor(budget * RETRY_BUDGET_SHARE));
    })
    .catch((error: unknown) => { throw summaryError(error); });

  return {
    result: result.output as AnalysisResult,
    usage: extractTokenUsage(result.usage),
  };
}
