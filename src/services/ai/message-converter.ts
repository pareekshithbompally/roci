/** A chat's messages → the model's input, by the AI SDK's own `convertToModelMessages`. */

import { convertToModelMessages, pruneMessages } from 'ai';
import type { DataUIPart, ModelMessage, TextPart, ToolSet } from 'ai';
import { attachedMeetingsText, formatSentAt } from '@core/ai';
import type { ChatData, ChatMessage } from '@shared/types';

/** What the model reads for a question's own data parts: when it was sent, and its attached meetings. */
function dataPartText(part: DataUIPart<ChatData>): TextPart {
  if (part.type === 'data-sentAt') return { type: 'text', text: formatSentAt(part.data.at) };
  return { type: 'text', text: attachedMeetingsText(part.data.context) };
}

/** A settled question or model reply; replies still streaming, errors and Roci's own notices (no model) stay out. */
function isConversation({ role, metadata }: ChatMessage): boolean {
  if (metadata?.state === 'loading' || metadata?.state === 'streaming') return false;
  return role === 'user' || (!metadata?.isError && !!metadata?.provider);
}

/** Every tool the conversation called. */
function toolNamesIn(messages: ModelMessage[]): string[] {
  const names = messages.flatMap((m) =>
    typeof m.content === 'string' ? [] : m.content.flatMap((part) => (part.type === 'tool-call' ? [part.toolName] : [])));
  return [...new Set(names)];
}

/** The chat for its model (a chat keeps one model), replies whole with their tool calls and the provider's own data. Calls to
 *  tools this call doesn't have (turned off since) are pruned, as providers refuse a history naming tools they weren't given;
 *  a stopped reply's unfinished tool calls are left out. */
export async function toModelMessages(messages: ChatMessage[], tools: ToolSet): Promise<ModelMessage[]> {
  const conversation = await convertToModelMessages(messages.filter(isConversation), {
    tools,
    ignoreIncompleteToolCalls: true,
    convertDataPart: dataPartText,
  });
  const gone = toolNamesIn(conversation).filter((name) => !(name in tools));
  return gone.length > 0 ? pruneMessages({ messages: conversation, toolCalls: [{ type: 'all', tools: gone }] }) : conversation;
}
