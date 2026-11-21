/** Web links in the default browser and files in their default app, through the opener plugin. */

import { openPath, openUrl as openNative } from '@tauri-apps/plugin-opener';
import { isTauriEnvironment } from './environment.service';

/** A link in the default browser: natively, or a new tab in browser dev. Never rejects. */
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

/** A file in its default app (a PDF in Preview). Throws when it can't, so the caller can say so. */
export async function openFile(path: string): Promise<void> {
  if (!isTauriEnvironment()) throw new Error('Opening files needs the app');
  await openPath(path);
}
