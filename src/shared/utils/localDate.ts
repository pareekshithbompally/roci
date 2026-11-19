/** Dates on the local calendar (wall-clock days, so daylight-saving days stay whole) and the time units they're counted in:
 *  one set for the whole app. */

export const MS_PER_MINUTE = 60_000;
export const MS_PER_DAY = 86_400_000;
export const MINUTES_PER_HOUR = 60;
export const DAYS_PER_WEEK = 7;

const pad = (n: number) => String(n).padStart(2, '0');

/** Local midnight of `date`'s day. */
export const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Local midnight `n` days after `date`'s day. */
export const addDays = (date: Date, n: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

/** Both fall on the same local day. */
export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Whole local days from `a` to `b` (negative when `b` is earlier); a daylight-saving day counts as one. */
export const daysBetween = (a: Date, b: Date) =>
  Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / MS_PER_DAY);

/** `YYYY-MM-DD` of the local day (date inputs, SQLite's `date(…, 'localtime')`, the AI tools' dates). */
export const localDayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
