/** Best-effort follow-up suggestions after a reply, through the one structured call; callers treat failure as none. */

import { SUGGESTIONS_PROMPT, suggestionsSchema } from '@core/ai';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import { SUGGESTION_COUNT } from '@config/chat.config';
import { generateStructured } from './structured';
import { exchangeText } from './promptText';

export async function generateSuggestions(options: {
  resolved: ResolvedModel;
  userMessage: string;
  responsePreview: string;
  signal?: AbortSignal;
  /** The chat session, for the usage row. */
  sessionId?: string;
}): Promise<string[]> {
  const { suggestions } = await generateStructured({
    job: 'suggestions',
    model: options.resolved,
    instructions: SUGGESTIONS_PROMPT,
    prompt: exchangeText(options.userMessage, options.responsePreview),
    schema: suggestionsSchema,
    usage: { category: 'suggestions', sessionId: options.sessionId },
    signal: options.signal,
  });
  return suggestions.slice(0, SUGGESTION_COUNT);
}
