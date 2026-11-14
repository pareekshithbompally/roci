/**
 * App events — one channel per moment (Settings › Notifications kinds):
 * Kasset in front → an in-app toast, or nothing when the result is already on
 * screen; in the background → a macOS notification (its switch applies).
 * Never both.
 */

import { showToast } from '@shared/ui';
import type { ToastTone } from '@shared/ui';
import { postNotice, type Notice } from '@services/notifications';
import type { NotificationKind } from '@shared/types';

export interface AppEvent extends Notice {
  kind: NotificationKind;
  tone: ToastTone;
  /** In front: `toast`, or `quiet` when the result is already on screen. */
  inFront: 'toast' | 'quiet';
}

export function notifyAppEvent({ tone, inFront, ...notice }: AppEvent): void {
  if (document.hasFocus()) {
    if (inFront === 'toast') showToast(notice.title, tone);
    return;
  }
  postNotice(notice).catch((error: unknown) => console.error('[notifyAppEvent] post failed:', error));
}
