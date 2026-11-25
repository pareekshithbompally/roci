import { describe, expect, it, vi } from 'vitest';
import type { LocalChatRequest } from '@services/onDevice.service';

const sent: LocalChatRequest[] = [];
vi.mock('@services/onDevice.service', () => ({
  localChat: vi.fn(async (_model: string, request: LocalChatRequest) => {
    sent.push(request);
    return { promptTokens: 1, completionTokens: 1, cancelled: false };
  }),
  localCancel: vi.fn(),
}));

describe('on-device chat: images go to the engine', () => {
  it('sends a user turn image as base64 beside its text, with the tools', async () => {
    const { onDeviceLanguageModel } = await import('@services/ai/onDevice/onDeviceLanguageModel');
    const png = new Uint8Array([137, 80, 78, 71]);
    await onDeviceLanguageModel('gemma-4-e2b').doGenerate({
      prompt: [{
        role: 'user',
        content: [
          { type: 'text', text: 'What is in this picture?' },
          { type: 'file', mediaType: 'image/png', data: { type: 'data', data: png } },
          { type: 'file', mediaType: 'image', data: { type: 'url', url: new URL('https://example.com/a.png') } },
        ],
      }],
      tools: [{ type: 'function', name: 'search', description: 'Search', inputSchema: { type: 'object' } }],
    } as never);
    const [request] = sent;
    expect(request.messages[0]).toEqual({ role: 'user', content: 'What is in this picture?', images: ['iVBORw=='] });
    expect(request.tools).toHaveLength(1);
  });
});
