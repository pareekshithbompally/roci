/** A chat's history within the model's context, the AI SDK's way: estimated each step, and past a share of the window old
 *  thinking and tool calls are pruned (`pruneMessages`), then the oldest whole turns left out. One rule for every model. */

import { pruneMessages } from 'ai';
import type { ModelMessage } from 'ai';
import { CHAT_CONTEXT_CONFIG, CHAT_ERROR_COPY } from '@config/chat.config';
import { TOKEN_ESTIMATE } from '@config/tokens.config';
import { AiError } from '@services/ai/errors';

const { pruneAbove, keepToolCallsInLast } = CHAT_CONTEXT_CONFIG;

/** Tokens in `text`, estimated. */
export const tokensIn = (text: string): number => Math.ceil(text.length / TOKEN_ESTIMATE.charsPerToken);

/** JSON replacer: a file's bytes aren't its tokens, so they count as nothing (the window's headroom covers files). */
function withoutFileBytes(this: unknown, key: string, value: unknown): unknown {
  const { type } = this as { type?: unknown };
  return (type === 'file' && key === 'data') || (type === 'image' && key === 'image') ? '' : value;
}

const messageTokens = (messages: ModelMessage[]): number => tokensIn(JSON.stringify(messages, withoutFileBytes));

/** Tokens the messages may take: `pruneAbove` of the window, less what every request carries (instructions, tools); null
 *  when the window is unknown (nothing is trimmed). */
export function messageRoom(contextTokens: number | null, fixedTokens: number): number | null {
  return contextTokens ? Math.floor(contextTokens * pruneAbove) - fixedTokens : null;
}

/** The oldest whole turns (each starts at a user message) left out until the rest fits; the latest user message stays, and
 *  when it alone doesn't fit, the reply says so. */
function withoutOldestTurns(messages: ModelMessage[], room: number): ModelMessage[] {
  let start = 0;
  while (messageTokens(messages.slice(start)) > room) {
    const next = messages.findIndex((message, index) => index > start && message.role === 'user');
    if (next === -1) throw new AiError('contextWindow', CHAT_ERROR_COPY.tooLong);
    start = next;
  }
  if (start > 0) console.info('[ContextFit] Left out the oldest messages:', start);
  return messages.slice(start);
}

/** The step's messages within `room`: as they are while they fit; else pruned, then cut to whole turns. */
export function fitMessages(messages: ModelMessage[], room: number | null): ModelMessage[] {
  if (room === null || messageTokens(messages) <= room) return messages;
  console.info('[ContextFit] Pruning old thinking and tool calls; room in tokens:', room);
  const pruned = pruneMessages({
    messages,
    reasoning: 'before-last-message',
    toolCalls: `before-last-${keepToolCallsInLast}-messages`,
    emptyMessages: 'remove',
  });
  return withoutOldestTurns(pruned, room);
}
