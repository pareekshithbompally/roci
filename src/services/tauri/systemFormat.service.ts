/** The device's date/time formats from the native side (system_format.rs), loaded once and kept current on change. */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isTauriEnvironment } from './environment.service';
import { setSystemFormat, type SystemFormat } from '@shared/stores/systemFormatStore';

const CHANGED_EVENT = 'system-format://changed';

interface NativeFormat {
  locale: string;
  hour24: boolean;
  first_weekday: number;
  min_days_in_first_week: number;
}

const toFormat = (native: NativeFormat): SystemFormat => ({
  locale: native.locale,
  hour24: native.hour24,
  firstWeekday: native.first_weekday,
  minDaysInFirstWeek: native.min_days_in_first_week,
});

/** Reads the formats (before the first render), then follows the system's change notification. Browser builds keep the defaults. */
export async function loadSystemFormat(): Promise<void> {
  if (!isTauriEnvironment()) return;
  try {
    setSystemFormat(toFormat(await invoke<NativeFormat>('system_format')));
    await listen<NativeFormat>(CHANGED_EVENT, ({ payload }) => setSystemFormat(toFormat(payload)));
  } catch (error: unknown) {
    console.error('[systemFormat] Reading the system formats failed:', error);
  }
}
