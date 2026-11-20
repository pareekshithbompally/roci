import { describe, expect, it, vi, beforeEach } from 'vitest';
import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const usage = vi.hoisted(() => ({ recordUsage: vi.fn() }));
const model = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@extensions/usage', () => usage);
vi.mock('@services/ai/provider', () => ({ createModel: () => model.current }));

import { generateStructured } from '@services/ai/structured';
import { AiError } from '@services/ai/errors';

const schema = z.strictObject({ title: z.string(), points: z.array(z.string().trim().min(1)) });
const resolved = { modelId: 'm', provider: 'openai', apiKey: 'k', baseUrl: '', model: 'm', providerConfig: {} } as never;
const TOKENS = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };

function replying(...texts: (string | Error)[]) {
  const replies = [...texts];
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const next = replies.shift();
      if (next instanceof Error) throw next;
      return { content: [{ type: 'text', text: next ?? '' }], finishReason: { unified: 'stop', raw: undefined }, usage: TOKENS, warnings: [] } as never;
    },
  });
}

const call = (extra: Partial<Parameters<typeof generateStructured>[0]> = {}) =>
  generateStructured({ job: 'summary', model: resolved, instructions: 'i', prompt: 'p', schema, usage: { category: 'summary', sessionId: 's1' }, ...extra });

beforeEach(() => vi.clearAllMocks());

describe('generateStructured', () => {
  it('hands the schema to the provider natively and leaves the instructions as written', async () => {
    const mock = replying('{"title":"T","points":["a"]}');
    model.current = mock;
    await call();
    const [request] = mock.doGenerateCalls;
    expect(request.responseFormat).toMatchObject({ type: 'json', schema: { required: ['title', 'points'] } });
    expect(JSON.stringify(request.prompt[0])).not.toContain('points');
  });

  it('reads a clean reply and records its usage under the meeting', async () => {
    model.current = replying('{"title":"Launch","points":["a","b"]}');
    expect(await call()).toEqual({ title: 'Launch', points: ['a', 'b'] });
    expect(usage.recordUsage).toHaveBeenCalledWith('summary', resolved, expect.objectContaining({ inputTokens: 10, outputTokens: 5 }), 's1');
  });

  it('keeps what fits from a reply that is partly wrong', async () => {
    model.current = replying('{"title":"Launch","points":["a", 3, ""],"extra":true}');
    expect(await call()).toEqual({ title: 'Launch', points: ['a'] });
  });

  it('says plainly when the reply has no JSON at all', async () => {
    model.current = replying('I cannot help with that.');
    await expect(call()).rejects.toMatchObject({ name: 'AiError', kind: 'badReply' });
  });

  it('tries once more with the shorter prompt when the first did not fit', async () => {
    const tooLong = new APICallError({ message: "This model's maximum context length is 8192 tokens", url: 'u', requestBodyValues: {}, statusCode: 400 });
    model.current = replying(tooLong, '{"title":"Short","points":[]}');
    const shorter = vi.fn(() => 'shorter prompt');
    expect(await call({ shorter })).toEqual({ title: 'Short', points: [] });
    expect(shorter).toHaveBeenCalledTimes(1);
  });

  it('turns a refused key into a sentence that says where to fix it', async () => {
    model.current = replying(new APICallError({ message: 'Unauthorized', url: 'u', requestBodyValues: {}, statusCode: 401, isRetryable: false }));
    const error = await call().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({ kind: 'auth', message: expect.stringContaining('Settings › Providers') });
  });
});
