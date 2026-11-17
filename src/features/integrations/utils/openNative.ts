import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '@services/tauri';
import { openUrl } from '@services/tauri/opener.service';
import { platform } from '@platform/index';
import { APP_CONFIG } from '@config/app.config';

/** Mirrors the Rust `NativeTarget` (src-tauri/src/open_native.rs). */
export type NativeTarget =
  | 'calendars-settings'
  | 'reminders-settings'
  | 'speech-recognition-settings'
  | 'apple-intelligence-settings'
  | 'automation-settings'
  | 'notifications-settings'
  | 'hex-app';

/** Opens a System Settings privacy pane or a companion app. */
export async function openNative(target: NativeTarget): Promise<void> {
  if (!isTauriEnvironment()) return;
  await invoke('open_native', { target });
}

/** A permission's settings: its privacy pane on Mac; iOS links only to Roci's own page in Settings. */
export async function openSettingsPane(target: NativeTarget): Promise<void> {
  if (!platform.canOpenSettingsPanes) return openUrl(APP_CONFIG.iosAppSettingsUrl);
  await openNative(target);
}
