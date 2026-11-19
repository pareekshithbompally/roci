/** A chat keeps one model: the provider and model of its first reply. Its history goes back to that model as it made it. */

import type { ModelRef } from '@services/ai/models';
import type { ChatSession } from '@shared/types';

/** The model a chat is locked to: the one that gave its first answer; none before it answers (a failed reply doesn't lock it). */
export function chatModelOf(session: ChatSession | null | undefined): ModelRef | undefined {
  const reply = session?.messages.find((m) => m.role === 'model' && !m.isError && m.provider && m.model);
  return reply?.provider && reply.model ? { provider: reply.provider, model: reply.model } : undefined;
}
