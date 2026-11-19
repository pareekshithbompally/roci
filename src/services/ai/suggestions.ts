/** Best-effort follow-up suggestions after a reply, through the one structured call; callers treat failure as none. */

import { suggestionsPrompt, suggestionsSchema, type ChatToolset } from '@core/ai';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import { SUGGESTION_COUNT } from '@config/chat.config';
import { generateStructured } from './structured';
import { exchangeText } from './promptText';

export async function generateSuggestions(options: {
  resolved: ResolvedModel;
  userMessage: string;
  responsePreview: string;
  /** The tools the reply had: suggestions ask only for what Roci can do here. */
  tools: ChatToolset;
  signal?: AbortSignal;
  /** The chat session, for the usage row. */
  sessionId?: string;
}): Promise<string[]> {
  const { suggestions } = await generateStructured({
    job: 'suggestions',
    model: options.resolved,
    instructions: suggestionsPrompt(options.tools),
    prompt: exchangeText(options.userMessage, options.responsePreview),
    schema: suggestionsSchema,
    usage: { category: 'suggestions', sessionId: options.sessionId },
    signal: options.signal,
  });
  return suggestions.slice(0, SUGGESTION_COUNT);
}
