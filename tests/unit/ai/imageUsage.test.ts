import { describe, expect, it, vi } from 'vitest';
import { MockImageModelV4 } from 'ai/test';

const recorded = vi.hoisted(() => ({ recordUsage: vi.fn() }));
vi.mock('@extensions/usage', () => recorded);
vi.mock('@services/ai/provider', () => ({
  createImageModel: () => new MockImageModelV4({
    doGenerate: async () => ({
      images: ['iVBORw0KGgo='],
      warnings: [],
      response: { timestamp: new Date(), modelId: 'gpt-image-1.5', headers: undefined },
      usage: { inputTokens: 40, outputTokens: 1_056, totalTokens: 1_096 },
    }) as never,
  }),
}));
vi.mock('@services/ai/image/catalog', () => ({
  resolveImageModel: () => ({ provider: 'openai', modelId: 'gpt-image-1.5' }),
}));
vi.mock('@services/storage', () => ({
  imagesService: { saveImage: vi.fn(async () => ({ appPath: 'images/a.png', path: '/tmp/a.png' })) },
}));

import { generateImageFile } from '@services/ai/image/generate';

describe('image generation usage', () => {
  it('records the image model\'s tokens under the chat the image was made for', async () => {
    await generateImageFile({ prompt: 'a ship', aspectRatio: '1:1', settings: {} as never, providers: [], sessionId: 'c1' });
    expect(recorded.recordUsage).toHaveBeenCalledWith(
      'image',
      { provider: 'openai', modelId: 'gpt-image-1.5' },
      expect.objectContaining({ inputTokens: 40, outputTokens: 1_056 }),
      'c1',
    );
  });
});
