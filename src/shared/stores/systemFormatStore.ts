/** The device's date and time formats (language + region, 12/24-hour, first weekday), read natively: the web view's Intl ignores them. */

import { create } from 'zustand';

export interface SystemFormat {
  /** BCP 47, e.g. `en-IN`; undefined → the web view's default (browser builds). */
  locale?: string;
  /** undefined → the locale's own clock. */
  hour24?: boolean;
  /** 1 = Sunday … 7 = Saturday. */
  firstWeekday: number;
}

export const useSystemFormatStore = create<SystemFormat>()(() => ({ firstWeekday: 1 }));

export const setSystemFormat = (format: SystemFormat) => useSystemFormatStore.setState(format, true);
export const systemFormat = () => useSystemFormatStore.getState();
/** For the app root: re-render everything when the user changes their formats. */
export const useSystemLocale = () => useSystemFormatStore((s) => `${s.locale}|${s.hour24}|${s.firstWeekday}`);
