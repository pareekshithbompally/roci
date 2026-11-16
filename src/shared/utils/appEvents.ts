/** One channel per app event: in front → in-app toast (or nothing if on screen); in background → macOS notification. */

import { showToast } from '@shared/ui';
import type { ToastTone } from '@shared/ui';
import { postNotice, type Notice } from '@services/notifications';
import type { NotificationKind } from '@shared/types';
import { platform } from '@platform/index';

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
  if (!platform.hasNotifications) return;
  postNotice(notice).catch((error: unknown) => console.error('[notifyAppEvent] post failed:', error));
}
