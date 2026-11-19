/** ChatMessage[] → AI SDK ModelMessage[]. */

import { pruneMessages } from 'ai';
import type { ModelMessage, FilePart, TextPart } from 'ai';
import { attachedMeetingsText } from '@core/ai';
import { toolResultTurn } from '@services/ai/promptText';
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

/** An earlier reply as every model can read it back: its text, Roci's tool calls and their results (in the tool messages).
 *  What only the model that made it can read is left out: tools the provider ran itself (their calls and results), thinking,
 *  and files; what they found is in the reply's text and citations. */
function readableByAnyModel(exchange: ModelMessage[]): ModelMessage[] {
  const kept = exchange.map((message) =>
    message.role === 'assistant' && typeof message.content !== 'string'
      ? { ...message, content: message.content.filter((part) => part.type === 'text' || (part.type === 'tool-call' && !part.providerExecuted)) }
      : message);
  return pruneMessages({ messages: kept });
}

/** A reply for a call without tools: one assistant turn with each tool's result, then the answer, as text. */
function replyAsText(exchange: ModelMessage[]): ModelMessage {
  const text = exchange.flatMap((message) => {
    if (typeof message.content === 'string') return [message.content];
    return message.content.flatMap((part) => {
      if (part.type === 'text') return [part.text];
      if (part.type === 'tool-result') return [toolResultTurn(part.toolName, part.output)];
      return [];
    });
  });
  return { role: 'assistant', content: text.join('\n\n') };
}

/** A reply as its model made it: tool calls, their results, the answer; a reply that never finished is its text. */
function replyMessages(msg: ChatMessage, tools: boolean): ModelMessage[] {
  if (!msg.exchange) return [{ role: 'assistant', content: msg.text }];
  const exchange = readableByAnyModel(msg.exchange);
  return tools ? exchange : [replyAsText(exchange)];
}

/** The conversation for any model: the same messages for every provider, remote or on this device. A call with tools gets
 *  earlier tool calls and results natively, one without gets them as text. Loading/streaming messages are left out. */
export function toSDKMessages(messages: ChatMessage[], { tools }: { tools: boolean }): ModelMessage[] {
  return messages
    .filter((m) => m.state !== 'loading' && m.state !== 'streaming')
    .flatMap((msg) => (msg.role === 'user' ? [userMessage(msg)] : replyMessages(msg, tools)));
}
