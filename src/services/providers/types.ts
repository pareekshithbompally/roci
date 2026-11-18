import type { ModelProvider, ProviderSetting } from '@shared/types/modelProviders'
import type { ListedModel } from './listing'

export interface ProvidersService {
  getProviders(): Promise<ModelProvider[]>
  fetchModelsFromProvider(provider: ModelProvider): Promise<ListedModel[]>
  updateSettings(providerName: string, settings: ProviderSetting[]): Promise<void>
  fetch(): typeof fetch
}
