/**
 * Request Builders — The Core Coupling Layer
 *
 * Prompt builder for chat and transcription requests.
 * Both unifiedAIService and the tool orchestrator call these builders.
 */

import { TRANSCRIPTION_SCHEMA } from './schemas/transcription.schema';
import { buildChatSystemPrompt } from './prompts/chat.prompt';
import { buildTranscriptionPrompt } from './prompts/transcription.prompt';
import type { ChatRequestConfig, TranscriptionRequestConfig, OutputSchema } from './types';

export interface ChatRequestOptions {
  contextBlock?: string;
  hasTools?: boolean;
  meetingCount?: number;
}

/**
 * Build the complete chat request configuration.
 * Returns the system prompt for the chat — plain text, no JSON wrapping.
 */
export function buildChatRequest(options: ChatRequestOptions): ChatRequestConfig {
  const {
    contextBlock,
    hasTools = false,
    meetingCount = 0,
  } = options;

  const systemPrompt = buildChatSystemPrompt({ contextBlock, hasTools, meetingCount });

  return { systemPrompt };
}

export interface TranscriptionRequestOptions {
  categories: string[];
  supportsStructuredOutput?: boolean;
}

/**
 * Same pattern for transcription — prompt + schema as atomic pair.
 */
export function buildTranscriptionRequest(options: TranscriptionRequestOptions): TranscriptionRequestConfig {
  const { categories, supportsStructuredOutput = false } = options;

  const outputSchema: OutputSchema | undefined = supportsStructuredOutput
    ? { name: 'transcription', schema: TRANSCRIPTION_SCHEMA }
    : undefined;

  const prompt = buildTranscriptionPrompt({ categories });

  return { prompt, outputSchema };
}
