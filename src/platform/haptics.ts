/** The app's one haptics owner (iPhone). A moment is named by what it means; this file maps it to UIKit's feedback. It
 *  plays only where the device has haptics, while Settings › General › Haptics is on, and iOS's own System Haptics
 *  switch (Settings › Sounds & Haptics) silences it too, as it does every app. */

import { impactFeedback, notificationFeedback, selectionFeedback } from '@tauri-apps/plugin-haptics';
import { platform } from './index';

/** What happened, not how it feels. */
export type HapticMoment =
  /** Something landed where it was going (dictated words in the box or sent, a recording saved). */
  | 'landed'
  /** It didn't work (a transcription failed). */
  | 'failed'
  /** The mic is listening. */
  | 'listening'
  /** A deliberate press with weight (recording starts, a context menu opens). */
  | 'pressed'
  /** A choice changed (a switch, a segment, a picker). */
  | 'select'
  /** About to do something that can't be undone. */
  | 'warn';

const PLAY: Record<HapticMoment, () => Promise<unknown>> = {
  landed: () => impactFeedback('light'),
  failed: () => notificationFeedback('error'),
  listening: () => impactFeedback('light'),
  pressed: () => impactFeedback('medium'),
  select: () => selectionFeedback(),
  warn: () => notificationFeedback('warning'),
};

let enabled = true;

/** Follows Settings › General › Haptics (set once settings load, and on every change). */
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

/** Plays `moment`'s haptic, if this device and the user's setting allow it. Never throws: a missed tap is not an error. */
export function haptic(moment: HapticMoment): void {
  if (!platform.hasHaptics || !enabled) return;
  PLAY[moment]().catch((error: unknown) => console.warn('[haptics] play failed:', error));
}
