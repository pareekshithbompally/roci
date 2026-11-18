/** Best-effort follow-up suggestions after a reply, via non-streaming generateText; callers treat failure as none. */

import { generateText, Output, jsonSchema } from 'ai';
import { createModel } from './provider';
import { extractTokenUsage } from './types';
import { recordUsage } from '@extensions/usage';
import { SUGGESTIONS_PROMPT, SUGGESTIONS_SCHEMA } from '@core/ai';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import { REPLY_PREVIEW_CHARS, SUGGESTION_COUNT } from '@config/chat.config';

export async function generateSuggestions(options: {
  resolved: ResolvedModel;
  userMessage: string;
  responsePreview: string;
  signal?: AbortSignal;
  /** The chat session, for the usage row. */
  sessionId?: string;
}): Promise<string[]> {
  const { resolved, userMessage, responsePreview, signal, sessionId } = options;

  const result = await generateText({
    model: createModel(resolved),
    instructions: SUGGESTIONS_PROMPT,
    messages: [
      {
        role: 'user',
        content: `User: ${userMessage}\n\nAssistant: ${responsePreview.slice(0, REPLY_PREVIEW_CHARS)}`,
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
    .slice(0, SUGGESTION_COUNT);

  return suggestions;
}
