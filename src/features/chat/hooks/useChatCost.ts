/** What chat replies cost, by the one price rule (Settings › Usage uses the same): a price set later shows on old replies too. */

import { useSettings } from '@shared/contexts/SettingsContext';
import { useModelCatalog } from '@shared/hooks/useModelCatalog';
import { costOf, priceOf } from '@extensions/usage';
import { formatCost } from '@extensions/usage/format';
import { CHAT_COST_COPY } from '@config/chat.config';
import type { ChatMessage } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';

type PricedReply = Pick<ChatMessage, 'provider' | 'model' | 'usage'>;

/** A reply's cost in USD; undefined when its price or tokens are unknown. */
export function replyCost(providers: ModelProvider[], { provider, model, usage }: PricedReply): number | undefined {
  if (!provider || !model || !usage) return undefined;
  return costOf(priceOf(providers, provider, model), usage);
}

/** The chat's replies that recorded their tokens: their summed cost, and how many have no price; null before any. */
export function chatCostOf(providers: ModelProvider[], messages: ChatMessage[]): { total: number; unpriced: number } | null {
  const costs = messages.filter((m) => m.role === 'model' && m.usage).map((m) => replyCost(providers, m));
  if (costs.length === 0) return null;
  return {
    total: costs.reduce<number>((sum, cost) => sum + (cost ?? 0), 0),
    unpriced: costs.filter((cost) => cost === undefined).length,
  };
}

/** A reply's cost as its gauge shows it; null when the reply recorded no tokens. */
export function useReplyCost(reply: PricedReply): string | null {
  useModelCatalog();
  const { providers } = useSettings();
  if (!reply.usage) return null;
  const cost = replyCost(providers, reply);
  return cost === undefined ? CHAT_COST_COPY.noPrice : formatCost(cost, true);
}

/** The chat's cost so far as the context ring shows it, with a note when some replies have no price; null before any reply. */
export function useChatCost(messages: ChatMessage[]): { total: string; note?: string } | null {
  useModelCatalog();
  const { providers } = useSettings();
  const cost = chatCostOf(providers, messages);
  if (!cost) return null;
  return { total: formatCost(cost.total, true), ...(cost.unpriced > 0 && { note: CHAT_COST_COPY.unpriced(cost.unpriced) }) };
}
