import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import type { ModelCapabilities } from '@services/ai/capabilities';

const capabilities = vi.fn<() => ModelCapabilities>();
vi.mock('@services/ai/capabilities', () => ({ capabilitiesOf: () => capabilities() }));

const { reasoningCallSettings } = await import('@services/ai/provider');
const { llamaServerRequestBody } = await import('@services/ai/llamaServer');

const model = (provider: string) => ({ provider, modelId: 'm', model: { id: 'm' } }) as ResolvedModel;
const thinks = (reasoning: boolean) =>
  capabilities.mockReturnValue({ tools: true, webSearch: false, audioInput: false, contextTokens: null, reasoning });

describe('reasoningCallSettings', () => {
  beforeEach(() => thinks(true));

  it('passes the level as the SDK reasoning setting for every provider', () => {
    expect(reasoningCallSettings(model('anthropic'), 'high')).toEqual({ reasoning: 'high' });
    expect(reasoningCallSettings(model('local:127.0.0.1:9931'), 'none')).toEqual({ reasoning: 'none' });
  });

  it('asks Gemini and OpenAI to return a thinking model\'s thoughts', () => {
    expect(reasoningCallSettings(model('gemini'), 'low').providerOptions).toEqual({ google: { thinkingConfig: { includeThoughts: true } } });
    expect(reasoningCallSettings(model('openai'), 'provider-default').providerOptions).toEqual({ openai: { reasoningSummary: 'auto' } });
  });

  it('asks for no thoughts when thinking is off or the model does not think', () => {
    expect(reasoningCallSettings(model('gemini'), 'none').providerOptions).toBeUndefined();
    thinks(false);
    expect(reasoningCallSettings(model('openai'), 'high').providerOptions).toBeUndefined();
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
