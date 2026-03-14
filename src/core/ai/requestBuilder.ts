/**
 * Request Builders — The Core Coupling Layer
 *
 * Prompt and schema are ALWAYS built together as an atomic pair.
 * No caller can get a prompt without the matching schema decision, or vice versa.
 *
 * Both unifiedAIService and the tool orchestrator call these builders.
 * Neither makes schema/prompt decisions on its own.
 */

import { CHAT_RESPONSE_SCHEMA, CHAT_RESPONSE_WITH_TITLE_SCHEMA } from './schemas/chat.schema';
import { TRANSCRIPTION_SCHEMA } from './schemas/transcription.schema';
import { buildChatSystemPrompt } from './prompts/chat.prompt';
import { buildTranscriptionPrompt } from './prompts/transcription.prompt';
import type { ChatRequestConfig, TranscriptionRequestConfig, OutputSchema } from './types';

export interface ChatRequestOptions {
  contextBlock?: string;
  hasTools?: boolean;
  meetingCount?: number;
  isFirstMessage?: boolean;
  supportsStructuredOutput?: boolean;
}

/**
 * Build the complete chat request configuration.
 * Returns prompt + schema + flags as an atomic unit.
 *
 * This is the ONLY place that decides:
 * - Whether API-level schema enforcement is used (based on model capability)
 * - Which schema variant to use (title vs no-title, based on isFirstMessage)
 *
 * The prompt always describes JSON fields — there is no "delimiter variant".
 */
export function buildChatRequest(options: ChatRequestOptions): ChatRequestConfig {
  const {
    contextBlock,
    hasTools = false,
    meetingCount = 0,
    isFirstMessage = false,
    supportsStructuredOutput = false,
  } = options;

  const includesTitle = supportsStructuredOutput && isFirstMessage;

  const outputSchema: OutputSchema | undefined = supportsStructuredOutput
    ? {
        name: includesTitle ? 'chat_response_with_title' : 'chat_response',
        schema: includesTitle ? CHAT_RESPONSE_WITH_TITLE_SCHEMA : CHAT_RESPONSE_SCHEMA,
      }
    : undefined;

  const systemPrompt = buildChatSystemPrompt({
    contextBlock,
    hasTools,
    meetingCount,
    isFirstMessage: includesTitle,
  });

  return {
    systemPrompt,
    outputSchema,
    includesTitle,
  };
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
