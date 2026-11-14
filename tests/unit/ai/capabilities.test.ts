import { describe, it, expect, vi, beforeEach } from 'vitest';

const getModelInfo = vi.hoisted(() => vi.fn());
const getModelContextLimit = vi.hoisted(() => vi.fn());
vi.mock('@services/modalities', () => ({ modalitiesService: { getModelInfo, getModelContextLimit } }));

import { capabilitiesOf } from '@services/ai/capabilities';

describe('capabilitiesOf', () => {
  beforeEach(() => {
    getModelInfo.mockReset().mockReturnValue(null);
    getModelContextLimit.mockReset().mockReturnValue(null);
  });

  it('falls back to provider defaults when models.dev has no entry', () => {
    expect(capabilitiesOf('openai', { id: 'x' })).toEqual({ tools: true, webSearch: true, audioInput: false, contextTokens: null });
    expect(capabilitiesOf('local:127.0.0.1:9000', { id: 'x' })).toEqual({ tools: false, webSearch: false, audioInput: false, contextTokens: null });
  });

  it('uses models.dev when present', () => {
    getModelInfo.mockReturnValue({ modalities: { input: ['text', 'audio'], output: ['text'] }, capabilities: { toolCall: true } });
    getModelContextLimit.mockReturnValue(128_000);
    expect(capabilitiesOf('openrouter', { id: 'm' })).toEqual({ tools: true, webSearch: false, audioInput: true, contextTokens: 128_000 });
  });

  it('lets the user override win over models.dev', () => {
    getModelInfo.mockReturnValue({ modalities: { input: ['audio'], output: ['text'] }, capabilities: { toolCall: true } });
    const caps = capabilitiesOf('gemini', { id: 'm', toolsEnabled: false, audioInput: false });
    expect(caps.tools).toBe(false);
    expect(caps.audioInput).toBe(false);
  });
});
