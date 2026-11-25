/** How the on-device adapters (Apple Intelligence, llama.cpp in the app) read AI SDK prompt content. */

import type { LanguageModelV4Prompt } from '@ai-sdk/provider';

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
