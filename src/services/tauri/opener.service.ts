/** Web links in the default browser: the opener plugin natively, a new tab in browser dev. Never rejects. */

import { openUrl as openNative } from '@tauri-apps/plugin-opener';
import { isTauriEnvironment } from './environment.service';

export const openUrl = async (url: string): Promise<void> => {
  if (!isTauriEnvironment()) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  try {
    await openNative(url);
  } catch (error: unknown) {
    console.error('[openUrl] open failed:', url, error);
  }
};
