/** Dates on the local calendar (wall-clock days, so daylight-saving days stay whole): one set of helpers for the whole app. */

const pad = (n: number) => String(n).padStart(2, '0');

/** Local midnight of `date`'s day. */
export const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Local midnight `n` days after `date`'s day. */
export const addDays = (date: Date, n: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

/** `YYYY-MM-DD` of the local day (date inputs, SQLite's `date(…, 'localtime')`, the AI tools' dates). */
export const localDayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
