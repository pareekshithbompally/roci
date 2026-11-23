/** Tauri environment and platform detection. */

import type { TauriEnvironment } from './types';

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function getTauriEnvironment(): Promise<TauriEnvironment> {
  if (!isTauriEnvironment()) {
    return { isTauri: false };
  }

  try {
    const { platform } = await import('@tauri-apps/plugin-os');
    const { getVersion } = await import('@tauri-apps/api/app');
    
    return {
      isTauri: true,
      platform: platform(),
      version: await getVersion(),
    };
  } catch (error) {
    console.warn('Failed to get Tauri environment details:', error);
    return { isTauri: true };
  }
}
