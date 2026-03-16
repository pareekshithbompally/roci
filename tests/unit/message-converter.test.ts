import { describe, it, expect } from 'vitest';
import {
  toGeminiHistory,
  toGeminiLastMessage,
  toAnthropicMessages,
  toOpenAIResponsesInput,
  toOpenAIMessages,
} from '../../services/adapters/message-converter';
import type { ChatMessage, ChatPart } from '../../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeMsg(overrides: Partial<ChatMessage> & Pick<ChatMessage, 'role' | 'text'>): ChatMessage {
  return { id: '1', timestamp: Date.now(), ...overrides };
}

const toolCallPart: Extract<ChatPart, { type: 'tool_call' }> = {
  type: 'tool_call',
  toolCallId: 'tc-1',
  toolName: 'search_meetings',
  arguments: { query: 'budget' },
  status: 'complete',
  result: { content: 'Found 3 meetings', isError: false, executionMs: 120 },
};

const textPart: Extract<ChatPart, { type: 'text' }> = {
  type: 'text',
  text: 'inline text',
};

const imagePart: ChatPart = {
  type: 'image',
  mimeType: 'image/png',
  source: { kind: 'data', base64: 'abc123' },
};

// ─── Scenario A: text + tool_call → falls back to m.text ────────────────────

describe('message-converter: tool_call filtering', () => {
  const msgWithToolCall = makeMsg({
    role: 'model',
    text: 'Here is the answer.',
    parts: [toolCallPart],
  });

  describe('Gemini', () => {
    it('toGeminiHistory uses m.text when only tool_call parts exist', () => {
      const result = toGeminiHistory([msgWithToolCall]);
      expect(result).toHaveLength(1);
      expect(result[0].parts).toEqual([{ text: 'Here is the answer.' }]);
    });

    it('toGeminiLastMessage uses m.text when only tool_call parts exist', () => {
      const result = toGeminiLastMessage(msgWithToolCall);
      expect(result).toEqual([{ text: 'Here is the answer.' }]);
    });
  });

  describe('Anthropic', () => {
    it('uses m.text when only tool_call parts exist', () => {
      const result = toAnthropicMessages([msgWithToolCall]);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Here is the answer.');
    });
  });

  describe('OpenAI Responses', () => {
    it('uses m.text when only tool_call parts exist', () => {
      const result = toOpenAIResponsesInput([msgWithToolCall], 'system');
      // [0] is the developer message, [1] is our model message
      expect(result[1].content).toBe('Here is the answer.');
    });
  });

  describe('OpenAI Completions', () => {
    it('uses m.text when only tool_call parts exist', () => {
      const result = toOpenAIMessages([msgWithToolCall], 'system');
      // [0] is the system message, [1] is our model message
      expect(result[1].content).toBe('Here is the answer.');
    });
  });
});

// ─── Scenario B: text + image + tool_call → image preserved, tool_call dropped

describe('message-converter: mixed media + tool_call', () => {
  const mixedMsg = makeMsg({
    role: 'model',
    text: 'Here is the answer.',
    parts: [textPart, imagePart, toolCallPart],
  });

  it('Gemini: image and text preserved, tool_call dropped', () => {
    const result = toGeminiHistory([mixedMsg]);
    const parts = result[0].parts;
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ text: 'inline text' });
    expect(parts[1]).toHaveProperty('inlineData');
    // No [Unsupported content]
    expect(JSON.stringify(parts)).not.toContain('Unsupported content');
  });

  it('Anthropic: image and text preserved, tool_call dropped', () => {
    const result = toAnthropicMessages([mixedMsg]);
    const content = result[0].content as any[];
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({ type: 'text', text: 'inline text' });
    expect(content[1]).toHaveProperty('type', 'image');
    expect(JSON.stringify(content)).not.toContain('Unsupported content');
  });

  it('OpenAI Responses: image and text preserved, tool_call dropped', () => {
    const result = toOpenAIResponsesInput([mixedMsg], 'system');
    const content = result[1].content as any[];
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({ type: 'input_text', text: 'inline text' });
    expect(content[1]).toHaveProperty('type', 'input_image');
    expect(JSON.stringify(content)).not.toContain('Unsupported content');
  });

  it('OpenAI Completions: image and text preserved, tool_call dropped', () => {
    const result = toOpenAIMessages([mixedMsg], 'system');
    const content = result[1].content as any[];
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({ type: 'text', text: 'inline text' });
    expect(content[1]).toHaveProperty('type', 'image_url');
    expect(JSON.stringify(content)).not.toContain('Unsupported content');
  });
});

// ─── Scenario C: tool_call only, empty text → safe fallback ─────────────────

describe('message-converter: tool_call only with empty text', () => {
  const emptyTextMsg = makeMsg({
    role: 'model',
    text: '',
    parts: [toolCallPart],
  });

  it('Gemini: falls back to empty text, no [Unsupported content]', () => {
    const result = toGeminiHistory([emptyTextMsg]);
    expect(result[0].parts).toEqual([{ text: '' }]);
  });

  it('Anthropic: falls back to empty text, no [Unsupported content]', () => {
    const result = toAnthropicMessages([emptyTextMsg]);
    expect(result[0].content).toBe('');
  });

  it('OpenAI: falls back to empty text, no [Unsupported content]', () => {
    const result = toOpenAIMessages([emptyTextMsg], 'system');
    expect(result[1].content).toBe('');
  });
});

// ─── Scenario D: no parts at all → plain text (regression baseline) ─────────

describe('message-converter: plain text messages unaffected', () => {
  const plainMsg = makeMsg({ role: 'user', text: 'Hello' });

  it('Gemini: plain text', () => {
    const result = toGeminiHistory([plainMsg]);
    expect(result[0].parts).toEqual([{ text: 'Hello' }]);
  });

  it('Anthropic: plain text', () => {
    const result = toAnthropicMessages([plainMsg]);
    expect(result[0].content).toBe('Hello');
  });
});

// ─── Scenario E: multi-turn with tool_call in prior turn ─────────────────────

describe('message-converter: Turn 2 history with prior tool_call', () => {
  const turn1User = makeMsg({ id: '1', role: 'user', text: 'Search for budget meetings' });
  const turn1Model = makeMsg({
    id: '2',
    role: 'model',
    text: 'I found 3 budget meetings.',
    parts: [toolCallPart],
  });
  const turn2User = makeMsg({ id: '3', role: 'user', text: 'Tell me more about the first one' });

  it('Gemini: prior model turn has clean text, no [Unsupported content]', () => {
    const result = toGeminiHistory([turn1User, turn1Model, turn2User]);
    expect(result[1].parts).toEqual([{ text: 'I found 3 budget meetings.' }]);
    expect(JSON.stringify(result)).not.toContain('Unsupported content');
  });

  it('Anthropic: prior model turn has clean text', () => {
    const result = toAnthropicMessages([turn1User, turn1Model, turn2User]);
    expect(result[1].content).toBe('I found 3 budget meetings.');
  });

  it('OpenAI Completions: prior model turn has clean text', () => {
    const result = toOpenAIMessages([turn1User, turn1Model, turn2User], 'system');
    // [0]=system, [1]=user, [2]=assistant, [3]=user
    expect(result[2].content).toBe('I found 3 budget meetings.');
  });
});
