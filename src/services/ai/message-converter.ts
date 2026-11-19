/** ChatMessage[] → AI SDK ModelMessage[]. */

import { pruneMessages } from 'ai';
import type { ModelMessage, FilePart, TextPart } from 'ai';
import { attachedMeetingsText } from '@core/ai';
import type { ChatMessage, ChatPart } from '@shared/types';

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function chatPartToSDKPart(part: ChatPart): TextPart | FilePart | null {
  switch (part.type) {
    case 'text':
      return { type: 'text', text: part.text };
    case 'image':
      if (part.source.kind === 'data') {
        return { type: 'file', mediaType: part.mimeType, data: base64ToUint8Array(part.source.base64) };
      }
      if (part.source.kind === 'url') {
        return { type: 'file', mediaType: part.mimeType, data: new URL(part.source.url) };
      }
      return { type: 'text', text: '[Attached image: unsupported source]' };
    case 'audio':
    case 'video':
    case 'document':
      if (part.source.kind === 'data') {
        return {
          type: 'file',
          data: base64ToUint8Array(part.source.base64),
          mediaType: part.mimeType,
          ...(part.type === 'document' && { filename: (part as Extract<ChatPart, { type: 'document' }>).fileName }),
        };
      }
      return { type: 'text', text: `[Attached ${part.type}: unsupported source]` };
    default:
      return null;
  }
}

/** A question: its text, its attachments as file parts, then the meetings attached to it. */
function userMessage(msg: ChatMessage): ModelMessage {
  const attachments = (msg.parts ?? []).filter((part) => part.type !== 'text' && part.type !== 'tool_call').flatMap((part) => chatPartToSDKPart(part) ?? []);
  const content: Array<TextPart | FilePart> = [
    ...(msg.text ? [{ type: 'text' as const, text: msg.text }] : []),
    ...attachments,
    ...(msg.meetingContext ? [{ type: 'text' as const, text: attachedMeetingsText(msg.meetingContext) }] : []),
  ];
  return { role: 'user', content };
}

/** A reply the model gave: not an error, nor one of Roci's own notices (those carry no model). */
const isModelReply = (msg: ChatMessage): boolean => !msg.isError && !!msg.provider;

/** A reply as its model made it (thinking, tool calls and results, the provider's own data); a reply that never finished is its text. */
function replyMessages(msg: ChatMessage): ModelMessage[] {
  return msg.exchange ?? [{ role: 'assistant', content: msg.text }];
}

/** Every tool the conversation called. */
function toolNamesIn(messages: ModelMessage[]): string[] {
  const names = messages.flatMap((m) =>
    typeof m.content === 'string' ? [] : m.content.flatMap((part) => (part.type === 'tool-call' ? [part.toolName] : [])));
  return [...new Set(names)];
}

/** The chat for its model, exactly as that model made it (a chat keeps one model): questions with their attachments and
 *  attached meetings, each reply whole. Calls to tools this call doesn't have (turned off since) are pruned, as providers
 *  refuse a history naming tools they weren't given. Loading/streaming messages, errors and Roci's notices are left out. */
export function toSDKMessages(messages: ChatMessage[], tools: readonly string[]): ModelMessage[] {
  const conversation = messages
    .filter((m) => m.state !== 'loading' && m.state !== 'streaming' && (m.role === 'user' || isModelReply(m)))
    .flatMap((msg) => (msg.role === 'user' ? [userMessage(msg)] : replyMessages(msg)));
  const gone = toolNamesIn(conversation).filter((name) => !tools.includes(name));
  return gone.length > 0 ? pruneMessages({ messages: conversation, toolCalls: [{ type: 'all', tools: gone }] }) : conversation;
}
