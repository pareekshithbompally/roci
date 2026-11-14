/**
 * Post-Response Suggestions
 *
 * Generates follow-up suggestions after a chat response completes.
 * Uses generateText() with Output.object() — non-streaming, so no
 * conflicts with native provider tools or web search.
 *
 * Best-effort: callers should .catch() and treat failure as no suggestions.
 */

import { generateText, Output, jsonSchema } from 'ai';
import { createModel } from './provider';
import { extractTokenUsage } from './types';
import { recordUsage } from '@extensions/usage';
import { formatTemporalContext } from '@core/ai';
import type { ResolvedModel } from '@shared/utils/modelResolver';

const SUGGESTIONS_SCHEMA = {
  type: 'object' as const,
  properties: {
    suggestions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Exactly 3 concise follow-up questions the user might ask, written in the user\'s voice.',
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
};

export async function generateSuggestions(options: {
  resolved: ResolvedModel;
  userMessage: string;
  responsePreview: string;
  signal?: AbortSignal;
  /** The chat session, for the usage row. */
  sessionId?: string;
}): Promise<string[]> {
  const { resolved, userMessage, responsePreview, signal, sessionId } = options;
  const temporalContext = formatTemporalContext();

  const result = await generateText({
    model: createModel(resolved),
    instructions: `You generate follow-up suggestions for a chat conversation. ${temporalContext} Given the user message and assistant response preview, output exactly 3 short follow-up suggestions (under 12 words each) the user might type next. Write them in the user\'s voice (e.g. "Show me the details" not "Would you like to see the details?").`,
    messages: [
      {
        role: 'user',
        content: `User: ${userMessage}\n\nAssistant: ${responsePreview.slice(0, 500)}`,
      },
    ],
    output: Output.object({ schema: jsonSchema(SUGGESTIONS_SCHEMA) }),
    abortSignal: signal,
  });
  recordUsage('suggestions', resolved, extractTokenUsage(result.usage), sessionId);

  const output = result.output as { suggestions?: unknown } | null;
  if (!output || !Array.isArray(output.suggestions)) return [];

  const suggestions = output.suggestions
    .filter((s: unknown): s is string => typeof s === 'string')
    .slice(0, 3);

  return suggestions;
}
