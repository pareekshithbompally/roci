import type { ModelProvider } from '../../types/modelProviders'
import { DefaultProvidersService } from './default'

export class TauriProvidersService extends DefaultProvidersService {
  protected buildExtraHeaders(provider: ModelProvider, baseUrl: string): Record<string, string> {
    const extra: Record<string, string> = {}

    if (baseUrl.includes('localhost:') || baseUrl.includes('127.0.0.1:')) {
      extra['Origin'] = 'tauri://localhost'
    }

    if (provider.custom_header) {
      provider.custom_header.forEach((h) => {
        extra[h.header] = h.value
      })
    }

    return extra
  }
}
