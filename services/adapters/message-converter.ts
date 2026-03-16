/**
 * Message Converters
 *
 * Convert ChatMessage[] (UI format with role 'user' | 'model')
 * into SDK-specific message formats for each provider.
 *
 * Each converter supports multimodal content: if a message has `parts`
 * with media, the content is built as an SDK-specific array. Otherwise,
 * falls back to plain text for backward compatibility.
 */

import type { ChatMessage, ChatPart } from '@/types';

// ─── Per-part converters ────────────────────────────────────────────────────

/** Convert a ChatPart to a Gemini SDK part */
function chatPartToGeminiPart(part: ChatPart): any {
  switch (part.type) {
    case 'text':
      return { text: part.text };
    case 'image':
    case 'audio':
    case 'video':
      if (part.source.kind === 'data') {
        return { inlineData: { mimeType: part.mimeType, data: part.source.base64 } };
      }
      return { text: `[Attached ${part.type}: unsupported source kind "${part.source.kind}"]` };
    case 'document':
      if (part.source.kind === 'data') {
        return { inlineData: { mimeType: part.mimeType, data: part.source.base64 } };
      }
      return { text: `[Attached: ${part.fileName}]` };
    default:
      return { text: '[Unsupported content]' };
  }
}

/** Convert a ChatPart to an Anthropic SDK content block */
function chatPartToAnthropicBlock(part: ChatPart): any {
  switch (part.type) {
    case 'text':
      return { type: 'text', text: part.text };
    case 'image':
      if (part.source.kind === 'data') {
        return {
          type: 'image',
          source: { type: 'base64', media_type: part.mimeType, data: part.source.base64 },
        };
      }
      return { type: 'text', text: `[Attached image: unsupported source]` };
    case 'document':
      if (part.source.kind === 'data' && part.mimeType === 'application/pdf') {
        return {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: part.source.base64 },
        };
      }
      return { type: 'text', text: `[Attached: ${part.fileName} — not supported by this provider]` };
    case 'audio':
    case 'video':
      return { type: 'text', text: `[Attached ${part.type}: ${(part as any).fileName || part.type} — not supported by this provider]` };
    default:
      return { type: 'text', text: '[Unsupported content]' };
  }
}

/** Convert a ChatPart to an OpenAI Responses API content part */
function chatPartToOpenAIResponsesPart(part: ChatPart): any {
  switch (part.type) {
    case 'text':
      return { type: 'input_text', text: part.text };
    case 'image':
      if (part.source.kind === 'data') {
        return { type: 'input_image', image_url: `data:${part.mimeType};base64,${part.source.base64}` };
      }
      if (part.source.kind === 'url') {
        return { type: 'input_image', image_url: part.source.url };
      }
      return { type: 'input_text', text: `[Attached image: unsupported source]` };
    case 'document':
      return { type: 'input_text', text: `[Attached: ${part.fileName} — not supported by this provider]` };
    case 'audio':
    case 'video':
      return { type: 'input_text', text: `[Attached ${part.type} — not supported by this provider]` };
    default:
      return { type: 'input_text', text: '[Unsupported content]' };
  }
}

/** Convert a ChatPart to an OpenAI Chat Completions content part */
function chatPartToOpenAICompletionsPart(part: ChatPart): any {
  switch (part.type) {
    case 'text':
      return { type: 'text', text: part.text };
    case 'image':
      if (part.source.kind === 'data') {
        return { type: 'image_url', image_url: { url: `data:${part.mimeType};base64,${part.source.base64}` } };
      }
      if (part.source.kind === 'url') {
        return { type: 'image_url', image_url: { url: part.source.url } };
      }
      return { type: 'text', text: `[Attached image: unsupported source]` };
    case 'document':
      return { type: 'text', text: `[Attached: ${part.fileName} — not supported by this provider]` };
    case 'audio':
    case 'video':
      return { type: 'text', text: `[Attached ${part.type} — not supported by this provider]` };
    default:
      return { type: 'text', text: '[Unsupported content]' };
  }
}

// ─── Message-level converters ───────────────────────────────────────────────

/** Filter out UI-only parts (tool_call) that have no provider representation. */
function filterProviderParts(parts: ChatPart[]): ChatPart[] {
  return parts.filter(p => p.type !== 'tool_call');
}

/** Check if a message has provider-convertible non-text parts (ignoring tool_call). */
function hasMediaParts(msg: ChatMessage): boolean {
  if (!msg.parts) return false;
  return filterProviderParts(msg.parts).some(p => p.type !== 'text');
}

// ── Gemini ──────────────────────────────────────────────────────────────────

/** Gemini Content format */
export interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{ text: string } | Record<string, any>>;
}

/** Convert messages into Gemini history with multimodal support. */
export function toGeminiHistory(messages: ChatMessage[]): GeminiContent[] {
  return messages.map((m) => ({
    role: m.role as 'user' | 'model',
    parts: hasMediaParts(m)
      ? filterProviderParts(m.parts!).map(chatPartToGeminiPart)
      : [{ text: m.text }],
  }));
}

/** Convert the last message to Gemini parts array, supporting multimodal. */
export function toGeminiLastMessage(msg: ChatMessage): any[] {
  if (hasMediaParts(msg)) {
    return filterProviderParts(msg.parts!).map(chatPartToGeminiPart);
  }
  return [{ text: msg.text }];
}

// ── Anthropic ───────────────────────────────────────────────────────────────

/** Anthropic message format */
export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | any[];
}

/** Convert ChatMessage[] to Anthropic messages with multimodal support. */
export function toAnthropicMessages(messages: ChatMessage[]): AnthropicMessage[] {
  return messages.map((m) => ({
    role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: hasMediaParts(m)
      ? filterProviderParts(m.parts!).map(chatPartToAnthropicBlock)
      : m.text,
  }));
}

// ── OpenAI Responses API ────────────────────────────────────────────────────

/** OpenAI Responses API message format */
export interface OpenAIResponsesMessage {
  role: 'developer' | 'user' | 'assistant';
  content: string | any[];
}

/** Convert ChatMessage[] to OpenAI Responses API input with developer role for system prompt. */
export function toOpenAIResponsesInput(
  messages: ChatMessage[],
  systemPrompt: string
): OpenAIResponsesMessage[] {
  return [
    { role: 'developer', content: systemPrompt },
    ...messages.map((m) => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: hasMediaParts(m)
        ? filterProviderParts(m.parts!).map(chatPartToOpenAIResponsesPart)
        : m.text,
    })),
  ];
}

// ── OpenAI Chat Completions (used by openai-compat) ─────────────────────────

/** OpenAI Chat Completions message format */
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | any[];
}

/** Convert ChatMessage[] to OpenAI Chat Completions messages with multimodal support. */
export function toOpenAIMessages(
  messages: ChatMessage[],
  systemPrompt: string
): OpenAIMessage[] {
  return [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: hasMediaParts(m)
        ? filterProviderParts(m.parts!).map(chatPartToOpenAICompletionsPart)
        : m.text,
    })),
  ];
}
