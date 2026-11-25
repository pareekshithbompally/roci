/** A chat's history within the model's context, the AI SDK's way: estimated each step, and past a share of the window the
 *  earlier turns' thinking and tool calls are pruned (`pruneMessages`), then the oldest whole turns left out; the turn in
 *  flight is never touched. One rule for every model. */

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

/** Tokens the messages may take: `pruneAbove` of the window and never the reply's own room (`replyTokens`, when the model
 *  caps its reply), less what every request carries (instructions, tools); null when the window is unknown, or when that
 *  fixed part alone fills it (nothing to trim then). */
export function messageRoom(contextTokens: number | null, fixedTokens: number, replyTokens = 0): number | null {
  if (!contextTokens) return null;
  const room = Math.min(Math.floor(contextTokens * pruneAbove), contextTokens - replyTokens) - fixedTokens;
  if (room > 0) return room;
  console.warn('[ContextFit] Instructions and tools alone fill the context; history left as it is:', fixedTokens);
  return null;
}

/** Where the turn in flight starts: the latest user message, followed by this turn's tool steps. */
function turnStart(messages: ModelMessage[]): number {
  for (let index = messages.length - 1; index > 0; index--) {
    if (messages[index].role === 'user') return index;
  }
  return 0;
}

/** The oldest whole turns of the history (each starts at a user message) left out until the rest fits; all of them if need be. */
function withoutOldestTurns(history: ModelMessage[], room: number): ModelMessage[] {
  let start = 0;
  while (start < history.length && messageTokens(history.slice(start)) > room) {
    const next = history.findIndex((message, index) => index > start && message.role === 'user');
    start = next === -1 ? history.length : next;
  }
  if (start > 0) console.info('[ContextFit] Left out the oldest messages:', start);
  return history.slice(start);
}

/** The step's messages within `room`: as they are while they fit; else the earlier turns pruned, then cut to whole turns.
 *  The turn in flight (its question, thinking and tool results) stays whole; when it alone doesn't fit, the reply says so. */
export function fitMessages(messages: ModelMessage[], room: number | null): ModelMessage[] {
  if (room === null || messageTokens(messages) <= room) return messages;
  const start = turnStart(messages);
  const turn = messages.slice(start);
  const historyRoom = room - messageTokens(turn);
  if (historyRoom < 0) throw new AiError('contextWindow', CHAT_ERROR_COPY.tooLong);
  console.info('[ContextFit] Pruning earlier turns; room for them in tokens:', historyRoom);
  const pruned = pruneMessages({
    messages: messages.slice(0, start),
    reasoning: 'all',
    toolCalls: `before-last-${keepToolCallsInLast}-messages`,
    emptyMessages: 'remove',
  });
  return [...withoutOldestTurns(pruned, historyRoom), ...turn];
}
