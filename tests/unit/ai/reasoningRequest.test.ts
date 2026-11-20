import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResolvedModel } from '@shared/utils/modelResolver';

const profile = vi.fn<() => { reasoning: boolean }>();
vi.mock('@services/ai/models', () => ({ profileOf: () => profile() }));

const { chatCallSettings } = await import('@services/ai/provider');
const { llamaServerRequestBody } = await import('@services/ai/llamaServer');

const model = (provider: string) => ({ provider, modelId: 'm', model: { id: 'm' } }) as ResolvedModel;
const thinks = (reasoning: boolean) =>
  profile.mockReturnValue({ reasoning });

describe('chatCallSettings', () => {
  beforeEach(() => thinks(true));

  it('passes the level as the SDK reasoning setting for every provider', () => {
    expect(chatCallSettings(model('anthropic'), 'high').reasoning).toBe('high');
    expect(chatCallSettings(model('local:127.0.0.1:9931'), 'none')).toEqual({ reasoning: 'none' });
  });

  it('asks only Anthropic to cache the conversation (the others cache by themselves)', () => {
    const cache = { anthropic: { cacheControl: { type: 'ephemeral' } } };
    expect(chatCallSettings(model('anthropic'), 'high').providerOptions).toEqual(cache);
    expect(chatCallSettings(model('anthropic'), 'none').providerOptions).toEqual(cache);
    expect(chatCallSettings(model('gemini'), 'low').providerOptions).not.toHaveProperty('anthropic');
  });

  it('asks Gemini and OpenAI to return a thinking model\'s thoughts', () => {
    expect(chatCallSettings(model('gemini'), 'low').providerOptions).toEqual({ google: { thinkingConfig: { includeThoughts: true } } });
    expect(chatCallSettings(model('openai'), 'provider-default').providerOptions).toEqual({ openai: { reasoningSummary: 'auto' } });
  });

  it('asks for no thoughts when thinking is off or the model does not think', () => {
    expect(chatCallSettings(model('gemini'), 'none').providerOptions).toBeUndefined();
    thinks(false);
    expect(chatCallSettings(model('openai'), 'high').providerOptions).toBeUndefined();
  });
});

describe('llamaServerRequestBody', () => {
  const body = { model: 'm', stream: true };

  it('always asks for progress, and sends the thinking budget for a level', () => {
    expect(llamaServerRequestBody('medium')(body)).toEqual({ ...body, return_progress: true, timings_per_token: true, thinking_budget_tokens: 2048 });
    expect(llamaServerRequestBody('max')(body)).toMatchObject({ thinking_budget_tokens: -1 });
  });

  it('sends no budget for Default or Off', () => {
    expect(llamaServerRequestBody('provider-default')(body)).not.toHaveProperty('thinking_budget_tokens');
    expect(llamaServerRequestBody('none')(body)).not.toHaveProperty('thinking_budget_tokens');
  });
});
