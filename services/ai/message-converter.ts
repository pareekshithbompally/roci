/**
 * Message Converter — ChatMessage[] → AI SDK ModelMessage[]
 */

import type { ModelMessage, ImagePart, FilePart, TextPart } from 'ai';
import type { ChatMessage, ChatPart } from '@/types';

function toDataUrl(base64: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64}`;
}

function filterProviderParts(parts: ChatPart[]): ChatPart[] {
  return parts.filter(p => p.type !== 'tool_call');
}

function chatPartToSDKPart(part: ChatPart): TextPart | ImagePart | FilePart | null {
  switch (part.type) {
    case 'text':
      return { type: 'text', text: part.text };
    case 'image':
      if (part.source.kind === 'data') {
        return { type: 'image', image: toDataUrl(part.source.base64, part.mimeType), mediaType: part.mimeType as ImagePart['mediaType'] };
      }
      if (part.source.kind === 'url') {
        return { type: 'image', image: new URL(part.source.url), mediaType: part.mimeType as ImagePart['mediaType'] };
      }
      return { type: 'text', text: '[Attached image: unsupported source]' };
    case 'audio':
    case 'video':
    case 'document':
      if (part.source.kind === 'data') {
        return {
          type: 'file',
          data: toDataUrl(part.source.base64, part.mimeType),
          mediaType: part.mimeType,
          ...(part.type === 'document' && { filename: (part as Extract<ChatPart, { type: 'document' }>).fileName }),
        };
      }
      return { type: 'text', text: `[Attached ${part.type}: unsupported source]` };
    default:
      return null;
  }
}

function hasMediaParts(msg: ChatMessage): boolean {
  if (!msg.parts) return false;
  return filterProviderParts(msg.parts).some(p => p.type !== 'text');
}

/**
 * Convert ChatMessage[] to AI SDK ModelMessage[].
 * - role 'model' → 'assistant'
 * - Multimodal parts mapped to ImagePart / FilePart
 * - tool_call parts filtered (UI-only)
 * - loading / streaming messages filtered
 */
export function toSDKMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages
    .filter(m => m.state !== 'loading' && m.state !== 'streaming')
    .map((msg): ModelMessage => {
      const role = msg.role === 'user' ? 'user' : 'assistant';

      if (msg.role === 'user' && hasMediaParts(msg)) {
        const content: Array<TextPart | ImagePart | FilePart> = [];
        for (const part of filterProviderParts(msg.parts!)) {
          const sdkPart = chatPartToSDKPart(part);
          if (sdkPart) content.push(sdkPart as TextPart | ImagePart | FilePart);
        }
        return { role: 'user', content };
      }

      return { role, content: msg.text };
    });
}
