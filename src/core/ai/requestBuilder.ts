/** Prompt builders for chat and transcription, shared by unifiedAIService and the tool orchestrator. */

import { TRANSCRIPTION_SCHEMA } from './schemas/transcription.schema';
import { buildChatSystemPrompt } from './prompts/chat.prompt';
import { buildTranscriptionPrompt } from './prompts/transcription.prompt';
import type { MeetingContext } from './prompts/transcription.prompt';
import type { ChatRequestConfig, TranscriptionRequestConfig, OutputSchema } from './types';

export interface ChatRequestOptions {
  contextBlock?: string;
  /** Whether the model supports tool calling (enables tool guidance in system prompt). */
  hasToolAccess?: boolean;
  meetingCount?: number;
  /** Formatted temporal context string from formatTemporalContext(). */
  temporalContext?: string;
}

/** Plain-text system prompt for a chat request. */
export function buildChatRequest(options: ChatRequestOptions): ChatRequestConfig {
  const {
    contextBlock,
    hasToolAccess = false,
    meetingCount = 0,
    temporalContext,
  } = options;

  const systemPrompt = buildChatSystemPrompt({ contextBlock, hasToolAccess, meetingCount, temporalContext });

  return { systemPrompt };
}

export interface TranscriptionRequestOptions {
  categories: string[];
  supportsStructuredOutput?: boolean;
  /** Calendar meeting context for speaker attribution. */
  meetingContext?: MeetingContext;
  /** Formatted temporal context string from formatTemporalContext(). */
  temporalContext?: string;
}

/** Transcription prompt and schema, built as one pair. */
export function buildTranscriptionRequest(options: TranscriptionRequestOptions): TranscriptionRequestConfig {
  const { categories, supportsStructuredOutput = false, meetingContext, temporalContext } = options;

  const outputSchema: OutputSchema | undefined = supportsStructuredOutput
    ? { name: 'transcription', schema: TRANSCRIPTION_SCHEMA }
    : undefined;

  const prompt = buildTranscriptionPrompt({ categories, meetingContext, temporalContext });

  return { prompt, outputSchema };
}
