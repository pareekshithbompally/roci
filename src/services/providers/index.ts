/**
 * Providers Service
 * Exports the appropriate providers service based on environment
 */

import { isTauriEnvironment } from '../tauri';
import { TauriProvidersService } from './tauri';
import { WebProvidersService } from './web';

export const providersService = isTauriEnvironment()
  ? new TauriProvidersService()
  : new WebProvidersService();

export type { ProvidersService } from './types';
export { TauriProvidersService } from './tauri';
export { WebProvidersService } from './web';
export { DefaultProvidersService } from './default';
