import { describe, it, expect } from 'vitest';
import { toSDKMessages } from '@services/ai/message-converter';
import { extractTokenUsage } from '@services/ai/types';
import type { ChatMessage } from '@shared/types';

const msg = (parts: ChatMessage['parts']): ChatMessage => ({
  id: 'm1',
  role: 'user',
  text: '',
  parts,
  timestamp: Date.now(),
  state: 'complete',
});

describe('AI SDK v7 message shapes', () => {
  it('maps image data parts to canonical file parts (ImagePart is deprecated)', () => {
    const bytes = btoa('fake-png-bytes');
    const [m] = toSDKMessages([msg([{ type: 'image', mimeType: 'image/png', source: { kind: 'data', base64: bytes } }])]);
    expect(m.role).toBe('user');
    const content = (m as { content: Array<{ type: string }> }).content;
    expect(content[0].type).toBe('file');
    expect(content.some((p) => p.type === 'image')).toBe(false);
  });

  it('maps image URL parts to file parts with URL data', () => {
    const [m] = toSDKMessages([
      msg([{ type: 'image', mimeType: 'image/png', source: { kind: 'url', url: 'https://example.com/a.png' } }]),
    ]);
    const content = (m as { content: Array<{ type: string; data?: unknown }> }).content;
    expect(content[0].type).toBe('file');
    expect(content[0].data).toBeInstanceOf(URL);
  });

  it('maps audio data parts to file parts', () => {
    const bytes = btoa('fake-audio');
    const [m] = toSDKMessages([msg([{ type: 'audio', mimeType: 'audio/wav', source: { kind: 'data', base64: bytes } }])]);
    const content = (m as { content: Array<{ type: string }> }).content;
    expect(content[0].type).toBe('file');
  });
});

describe('extractTokenUsage', () => {
  it('reads cache and reasoning tokens from v7 usage details', () => {
    expect(
      extractTokenUsage({
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        inputTokenDetails: { cacheReadTokens: 3, cacheWriteTokens: 4 },
        outputTokenDetails: { reasoningTokens: 2 },
      }),
    ).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      cacheReadTokens: 3,
      cacheWriteTokens: 4,
      reasoningTokens: 2,
    });
  });
});
