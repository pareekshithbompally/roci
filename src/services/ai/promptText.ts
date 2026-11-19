/** Prompt text Roci builds or reads: an exchange quoted for a side task (titles, suggestions), and how the on-device adapters
 *  (Apple Intelligence, MLX) read AI SDK prompt content. */

import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { REPLY_PREVIEW_CHARS } from '@config/chat.config';

/** A question and the start of its reply, quoted for a side task about the conversation (naming it, suggesting follow-ups). */
export function exchangeText(question: string, reply: string): string {
  return `User: ${question}\n\nAssistant: ${reply.slice(0, REPLY_PREVIEW_CHARS)}`;
}

/** A message's text parts, joined. */
export function textOf(message: LanguageModelV4Prompt[number]): string {
  if (message.role === 'system') return message.content;
  return message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n\n');
}

/** A tool result's payload as text: the SDK's `{ type, value }` output, or a raw value. */
export function toolResultText(output: unknown): string {
  const value = (output as { value?: unknown } | null)?.value ?? output;
  return typeof value === 'string' ? value : JSON.stringify(value);
}
