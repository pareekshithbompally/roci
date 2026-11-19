import { afterEach, describe, it, expect } from 'vitest';
import { getProviderApp, getProviderTitle, getProviderLogo, isLocalProviderId } from '@shared/utils/provider.utils';
import { LOCAL_GENERIC_LOGO } from '@config/localServers.config';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';

describe('getProviderTitle', () => {
  it('returns known cloud titles', () => {
    expect(getProviderTitle('openai')).toBe('OpenAI');
    expect(getProviderTitle('groq')).toBe('Groq');
  });

  it('titles known local servers from the local servers config', () => {
    expect(getProviderTitle('local:ollama')).toBe('Ollama');
    expect(getProviderTitle('local:lmstudio')).toBe('LM Studio');
  });

  it('titles a custom local server by its address', () => {
    expect(getProviderTitle('local:127.0.0.1:9000')).toBe('127.0.0.1:9000');
  });

  it('capitalizes unknown providers and handles empty input', () => {
    expect(getProviderTitle('foobar')).toBe('Foobar');
    expect(getProviderTitle('')).toBe('Unknown');
  });
});

describe('getProviderLogo', () => {
  it('uses the engine logo for known local servers and the generic one otherwise', () => {
    expect(getProviderLogo('local:jan')).toBe('/images/model-provider/jan.png');
    expect(getProviderLogo('local:127.0.0.1:9000')).toBe(LOCAL_GENERIC_LOGO);
  });
});

describe('isLocalProviderId', () => {
  it('matches only local: ids', () => {
    expect(isLocalProviderId('local:ollama')).toBe(true);
    expect(isLocalProviderId('openai')).toBe(false);
  });
});

describe('a server the user named', () => {
  afterEach(() => queryClient.removeQueries({ queryKey: queryKeys.storeSettings() }));

  it("takes its app's name, logo and Mac app everywhere", () => {
    const id = 'local:localhost:9931';
    queryClient.setQueryData(queryKeys.storeSettings(), {
      providers: [{ provider: id, active: true, settings: [], models: [], server_app: 'llama' }],
    });
    expect(getProviderTitle(id)).toBe('Llama');
    expect(getProviderLogo(id)).toBe('/images/model-provider/llama-cpp.png');
    expect(getProviderApp(id)).toBe('app.llama.Llama');
  });
});
