import { afterEach, describe, it, expect } from 'vitest';
import { getProviderTitle, isLocalProviderId, logoOf } from '@shared/utils/provider.utils';
import { AI_LOGO, DEVICE_LOGOS, LOGOS } from '@config/providerLogos.config';
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

describe('logoOf', () => {
  it("a cloud provider's tile, a server app's tile, the generic server tile for an unnamed server", () => {
    expect(logoOf('openai')).toBe(LOGOS.openai);
    expect(logoOf('local:jan')).toBe(LOGOS.jan);
    expect(logoOf('local:127.0.0.1:9000')).toBe(LOGOS.server);
  });

  it("this device by form factor, and the AI tile for Apple's and anything unknown", () => {
    expect(logoOf('on-device', 'phone')).toBe(DEVICE_LOGOS.phone);
    expect(logoOf('apple-intelligence')).toBe(AI_LOGO);
    expect(logoOf('somebody-new')).toBe(AI_LOGO);
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

  it("takes its app's name and logo everywhere", () => {
    const id = 'local:localhost:9931';
    queryClient.setQueryData(queryKeys.storeSettings(), {
      providers: [{ provider: id, active: true, settings: [], models: [], server_app: 'llama' }],
    });
    expect(getProviderTitle(id)).toBe('Llama');
    expect(logoOf(id)).toBe(LOGOS.llama);
  });
});
