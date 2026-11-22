/** A chat's messages → the model's input, by the AI SDK's own `convertToModelMessages`; every attached file arrives as
 *  something the model can read. */

import { convertToModelMessages, pruneMessages } from 'ai';
import type { DataUIPart, FileUIPart, ModelMessage, TextPart, TextUIPart, ToolSet } from 'ai';
import { attachedFileText, attachedMeetingsText, formatSentAt, unreadableFileText } from '@core/ai';
import { attachmentInput } from '@shared/utils/chatParts';
import { dataUrlText } from '@shared/utils/file.utils';
import { ATTACHMENT_TYPES, CHAT_DRAFT_COPY } from '@config/chat.config';
import type { Modality } from '@config/modelSpine.config';
import type { ChatData, ChatMessage, ChatPart } from '@shared/types';

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

/** An attached file as this model can take it: a text file as its contents, a file it reads (its `input` has what the file
 *  needs) as itself, any other as a line naming it. The chat keeps the file; only what the model is sent changes. */
function readableFile(part: FileUIPart, input: readonly Modality[]): FileUIPart | TextUIPart {
  const name = part.filename || CHAT_DRAFT_COPY.untitledAttachment;
  const needs = attachmentInput(part.mediaType, part.filename);
  const contents = needs === 'text' ? dataUrlText(part.url) : null;
  if (contents !== null) {
    return { type: 'text', text: attachedFileText(name, contents.slice(0, ATTACHMENT_TYPES.text.maxChars), contents.length) };
  }
  if (needs && needs !== 'text' && input.includes(needs)) return part;
  return { type: 'text', text: unreadableFileText(name) };
}

const readableParts = (message: ChatMessage, input: readonly Modality[]): ChatMessage => ({
  ...message,
  parts: message.parts.map((part): ChatPart => (part.type === 'file' ? readableFile(part, input) : part)),
});

/** Every tool the conversation called. */
function toolNamesIn(messages: ModelMessage[]): string[] {
  const names = messages.flatMap((m) =>
    typeof m.content === 'string' ? [] : m.content.flatMap((part) => (part.type === 'tool-call' ? [part.toolName] : [])));
  return [...new Set(names)];
}

/** The chat for its model (a chat keeps one model), replies whole with their tool calls and the provider's own data, and
 *  each attached file as the model's `input` can take it. Calls to tools this call doesn't have (turned off since) are
 *  pruned, as providers refuse a history naming tools they weren't given; a stopped reply's unfinished tool calls are left
 *  out. */
export async function toModelMessages(messages: ChatMessage[], tools: ToolSet, input: readonly Modality[]): Promise<ModelMessage[]> {
  const sent = messages.filter(isConversation).map((message) => readableParts(message, input));
  const conversation = await convertToModelMessages(sent, {
    tools,
    ignoreIncompleteToolCalls: true,
    convertDataPart: dataPartText,
  });
  const gone = toolNamesIn(conversation).filter((name) => !(name in tools));
  return gone.length > 0 ? pruneMessages({ messages: conversation, toolCalls: [{ type: 'all', tools: gone }] }) : conversation;
}
