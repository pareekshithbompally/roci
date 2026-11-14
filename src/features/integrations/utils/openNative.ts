import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '@services/tauri';

/** Mirrors the Rust `NativeTarget` (src-tauri/src/open_native.rs). */
export type NativeTarget =
  | 'calendars-settings'
  | 'reminders-settings'
  | 'speech-recognition-settings'
  | 'apple-intelligence-settings'
  | 'automation-settings'
  | 'hex-app';

/** Opens a System Settings privacy pane or a companion app. */
export async function openNative(target: NativeTarget): Promise<void> {
  if (!isTauriEnvironment()) return;
  await invoke('open_native', { target });
}
