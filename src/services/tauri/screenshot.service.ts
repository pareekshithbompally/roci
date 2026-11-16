/** Screenshots for chat attachments, taken by the Rust core (`screenshot.rs`); only inside the app. */

import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from './environment.service';

/** A window that can be captured, as the Rust core lists it. */
export interface CapturableWindow {
  window_id: number;
  app_name: string;
  title: string;
  icon_base64?: string;
}

/** Whether screenshots can be taken here (the app, not a browser tab). */
export const canTakeScreenshots = (): boolean => isTauriEnvironment();

/** Windows on screen that can be captured; none outside the app. */
export async function listCapturableWindows(): Promise<CapturableWindow[]> {
  if (!isTauriEnvironment()) return [];
  return invoke<CapturableWindow[]>('list_capturable_windows');
}

/** A PNG (base64) of one window, or the whole screen when `windowId` is null. */
export async function takeScreenshot(windowId: number | null): Promise<string> {
  if (!isTauriEnvironment()) throw new Error('Screenshots need the Kasset app');
  return invoke<string>('take_screenshot', { windowId });
}
