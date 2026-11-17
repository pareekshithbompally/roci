import { describe, expect, it, vi } from 'vitest';
import type { MlxChatRequest } from '@services/mlx.service';

const sent: MlxChatRequest[] = [];
vi.mock('@services/mlx.service', () => ({
  mlxChat: vi.fn(async (_model: string, request: MlxChatRequest) => {
    sent.push(request);
    return { promptTokens: 1, completionTokens: 1, cancelled: false };
  }),
  mlxCancel: vi.fn(),
}));

describe('on-device chat: images go to the engine', () => {
  it('sends a user turn image as base64 beside its text, with the tools', async () => {
    const { mlxLanguageModel } = await import('@services/ai/onDevice/mlxLanguageModel');
    const png = new Uint8Array([137, 80, 78, 71]);
    await mlxLanguageModel('gemma-4-e2b').doGenerate({
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
