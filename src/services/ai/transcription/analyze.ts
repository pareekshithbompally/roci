import { generateText, Output, jsonSchema } from 'ai';
import { buildTranscriptionRequest, formatTemporalContext } from '@core/ai';
import { createModel } from '../../ai/provider';
import { extractTokenUsage } from '../../ai/types';
import type { TokenUsage } from '../../ai/types';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import type { MeetingContext } from '@core/ai/prompts/transcription.prompt';
import type { AnalysisResult } from '@core/ai/schemas/transcription.schema';

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

  const result = await generateText({
    model: createModel(args.resolved),
    system: config.prompt,
    prompt: `Transcript:\n${args.transcript}`,
    output: Output.object({ schema: jsonSchema(config.outputSchema!.schema) }),
  });

  return {
    result: result.output as AnalysisResult,
    usage: extractTokenUsage(result.usage),
  };
}
