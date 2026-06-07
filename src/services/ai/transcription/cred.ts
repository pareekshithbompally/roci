import type { ModelProvider } from '@shared/types/modelProviders';

export interface Cred {
  apiKey: string;
  baseUrl?: string;
}

export function resolveCred(providerId: string, providers: ModelProvider[]): Cred {
  const provider = providers.find((p) => p.provider === providerId && p.active);
  if (!provider) {
    throw new Error(`Provider "${providerId}" is not configured or is inactive.`);
  }

  const apiKeySetting = provider.settings?.find((s) => s.key === 'api-key');
  const apiKey = (apiKeySetting?.controller_props?.value as string) || provider.api_key || '';
  if (!apiKey || apiKey.trim() === '') {
    throw new Error(
      `Configure ${providerId.charAt(0).toUpperCase() + providerId.slice(1)} API key in Settings → Providers.`,
    );
  }

  const baseUrlSetting = provider.settings?.find((s) => s.key === 'base-url');
  const baseUrl = (baseUrlSetting?.controller_props?.value as string) || provider.base_url || undefined;

  return { apiKey, baseUrl };
}
