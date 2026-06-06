/**
 * Environment detection utility for Tauri
 * Provides safe detection of Tauri environment and platform information
 */

import type { TauriEnvironment } from './types';

/**
 * Check if the app is running in Tauri environment
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Get detailed environment information
 */
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

/**
 * Execute function only in Tauri environment
 * @param fn Function to execute
 * @param fallback Optional fallback for non-Tauri environments
 */
export async function whenTauri<T>(
  fn: () => T | Promise<T>,
  fallback?: () => T | Promise<T>
): Promise<T | undefined> {
  if (isTauriEnvironment()) {
    return await fn();
  }
  return fallback ? await fallback() : undefined;
}
