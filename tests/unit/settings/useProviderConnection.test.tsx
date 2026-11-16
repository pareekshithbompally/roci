import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ModelProvider } from '@shared/types/modelProviders';

const service = vi.hoisted(() => ({ fetchModelsFromProvider: vi.fn() }));
vi.mock('@services/providers', () => ({ providersService: service }));

import { useProviderConnection } from '@features/settings/hooks/useProviderConnection';
import { canListModels } from '@shared/utils/modelResolver';

function provider(id: string, settings: Record<string, string>): ModelProvider {
  return {
    provider: id,
    active: true,
    settings: Object.entries(settings).map(([key, value]) => ({
      key,
      title: key,
      description: '',
      controller_type: 'input',
      controller_props: { value },
    })),
    models: [],
  } as unknown as ModelProvider;
}

function renderConnection(initial: ModelProvider) {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(({ p }) => useProviderConnection(p), { wrapper, initialProps: { p: initial } });
}

beforeEach(() => vi.clearAllMocks());

describe('useProviderConnection', () => {
  it('is incomplete without a key, and Test does nothing', () => {
    const { result } = renderConnection(provider('openai', { 'api-key': '' }));
    expect(result.current.status).toEqual({ state: 'incomplete' });
    act(() => result.current.test());
    expect(service.fetchModelsFromProvider).not.toHaveBeenCalled();
  });

  it('a custom provider needs its base URL too', () => {
    const { result } = renderConnection(provider('openrouter', { 'api-key': 'k', 'base-url': '' }));
    expect(result.current.status).toEqual({ state: 'incomplete' });
  });

  it('never checks on its own; Test lists the models and connects', async () => {
    service.fetchModelsFromProvider.mockResolvedValue(['gpt-a', 'gpt-b']);
    const { result } = renderConnection(provider('openai', { 'api-key': 'sk-1' }));
    expect(result.current.status).toEqual({ state: 'untested' });
    expect(service.fetchModelsFromProvider).not.toHaveBeenCalled();

    act(() => result.current.test());
    await waitFor(() => expect(result.current.status).toEqual({ state: 'connected', modelIds: ['gpt-a', 'gpt-b'] }));
    expect(service.fetchModelsFromProvider).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openai', api_key: 'sk-1', base_url: 'https://api.openai.com/v1' }),
    );
  });

  it('reports a rejected key with its message, without retrying', async () => {
    service.fetchModelsFromProvider.mockRejectedValue(new Error('Authentication failed: invalid key'));
    const { result } = renderConnection(provider('openai', { 'api-key': 'bad' }));
    act(() => result.current.test());
    await waitFor(() => expect(result.current.status).toEqual({ state: 'failed', message: 'Authentication failed: invalid key' }));
    expect(service.fetchModelsFromProvider).toHaveBeenCalledOnce();
  });

  it('editing the key makes it untested again', async () => {
    service.fetchModelsFromProvider.mockResolvedValue(['gpt-a']);
    const { result, rerender } = renderConnection(provider('openai', { 'api-key': 'sk-1' }));
    act(() => result.current.test());
    await waitFor(() => expect(result.current.status.state).toBe('connected'));
    rerender({ p: provider('openai', { 'api-key': 'sk-2' }) });
    expect(result.current.status).toEqual({ state: 'untested' });
  });
});

describe('canListModels', () => {
  it('managed SDKs and providers with a base URL can; speech-only providers cannot', () => {
    expect(canListModels(provider('anthropic', { 'api-key': '' }))).toBe(true);
    expect(canListModels(provider('openrouter', { 'api-key': '', 'base-url': '' }))).toBe(true);
    expect(canListModels(provider('deepgram', { 'api-key': '' }))).toBe(false);
    expect(canListModels(provider('elevenlabs', { 'api-key': '' }))).toBe(false);
  });
});
