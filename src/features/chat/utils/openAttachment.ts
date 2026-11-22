/** A chat attachment opened in its default app (a PDF in Preview): a copy goes to cache/open, then macOS opens it. */

import type { FileUIPart } from '@shared/types';
import { cacheService } from '@services/storage';
import { openFile } from '@services/tauri';
import { showToast } from '@shared/ui';
import { ATTACHMENT_COPY } from '@config/chat.config';

export async function openAttachment(part: FileUIPart): Promise<void> {
  const name = part.filename || 'attachment';
  try {
    const bytes = new Uint8Array(await (await fetch(part.url)).arrayBuffer());
    await openFile(await cacheService.openCopy(name, bytes));
  } catch (error: unknown) {
    console.error('[openAttachment] Open failed:', name, error);
    showToast(ATTACHMENT_COPY.openFailed(name), 'error');
  }
}
