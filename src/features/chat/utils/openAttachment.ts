/** A chat attachment opened in its default app (a PDF in Preview): a copy goes to cache/open, then macOS opens it. `src` is
 *  where it loads from (its kept file's asset URL, or its own URL). */

import { cacheService } from '@services/storage';
import { openFile } from '@services/tauri';
import { showToast } from '@shared/ui';
import { ATTACHMENT_COPY } from '@config/chat.config';

export async function openAttachment(name: string, src: string): Promise<void> {
  try {
    const bytes = new Uint8Array(await (await fetch(src)).arrayBuffer());
    await openFile(await cacheService.openCopy(name, bytes));
  } catch (error: unknown) {
    console.error('[openAttachment] Open failed:', name, error);
    showToast(ATTACHMENT_COPY.openFailed(name), 'error');
  }
}
