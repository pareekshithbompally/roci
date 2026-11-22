import { systemFormat } from '@shared/stores/systemFormatStore';
import { daysBetween } from '@shared/utils/localDate';

export { setSystemFormat } from '@shared/stores/systemFormatStore';

/** `date` in the device's locale, and on its clock when a time is shown (the web view's own defaults ignore the Mac's settings). */
function format(date: Date | string | number, options: Intl.DateTimeFormatOptions): string {
  const value = new Date(date);
  // An unreadable date shows as nothing rather than throwing out of a render.
  if (Number.isNaN(value.getTime())) return '';
  const showsTime = 'hour' in options || 'timeStyle' in options;
  return new Intl.DateTimeFormat(systemFormat().locale, { ...options, ...(showsTime ? hourOption() : {}) }).format(value);
}

/** The app's one date style: "19 Nov 2026" / "Nov 19, 2026", as the device writes it. */
export const formatDate = (date: Date | string | number) => format(date, { dateStyle: 'medium' });

/** Date and time: "19 Nov 2026, 21:28". */
export const formatDateTime = (date: Date | string | number) => format(date, { dateStyle: 'medium', timeStyle: 'short' });

/** Day and month: "19 Nov". */
export const formatShortDate = (date: Date | string | number) => format(date, { day: 'numeric', month: 'short' });

/** Day, month and time: "19 Nov, 21:28". */
export const formatShortDateTime = (date: Date | string | number) => format(date, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Weekday, day and month: "Thu, 19 Nov". */
export const formatWeekdayDate = (date: Date | string | number) => format(date, { weekday: 'short', day: 'numeric', month: 'short' });

/** Month name alone: "Nov". */
export const formatMonthShort = (date: Date | string | number) => format(date, { month: 'short' });

/** Weekday name: "Thu". */
export const formatWeekday = (date: Date | string | number) => format(date, { weekday: 'short' });

/** A month as a calendar titles it: "November 2026". */
export const formatMonth = (date: Date | string | number) => format(date, { month: 'long', year: 'numeric' });

/** A time of day on the device's clock: "21:28" or "9:28 PM". */
export const formatClockTime = (date: Date | string | number) => format(date, { timeStyle: 'short' });

/** An hour as Calendar's time axis names it: "09:00" on a 24-hour clock, "9 AM" on a 12-hour one. */
export function formatHour(hour: number): string {
  const at = new Date(2000, 0, 1, hour);
  const { hourCycle } = new Intl.DateTimeFormat(systemFormat().locale, { hour: 'numeric', ...hourOption() }).resolvedOptions();
  return hourCycle === 'h23' || hourCycle === 'h24' ? format(at, { hour: '2-digit', minute: '2-digit' }) : format(at, { hour: 'numeric' });
}

/** The device's clock as an Intl option, when it is known. */
function hourOption(): Intl.DateTimeFormatOptions {
  const { hour24 } = systemFormat();
  return hour24 === undefined ? {} : { hourCycle: hour24 ? 'h23' : 'h12' };
}

/** Largest first: the first unit that fits names the gap. */
const RELATIVE_UNITS = [
  { seconds: 86_400, long: 'day', short: 'd' },
  { seconds: 3_600, long: 'hour', short: 'h' },
  { seconds: 60, long: 'minute', short: 'm' },
] as const;
const RELATIVE_LIMIT_SECONDS = 7 * 86_400;

/** Relative time: "2 hours ago", or with `short` (list rows) "2h ago"; a week or older is the date. */
export function formatRelativeTime(date: Date | string | number, { short = false }: { short?: boolean } = {}): string {
  const diffSecs = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diffSecs < 60) return 'just now';
  if (diffSecs >= RELATIVE_LIMIT_SECONDS) return formatDate(date);
  const unit = RELATIVE_UNITS.find((u) => diffSecs >= u.seconds) ?? RELATIVE_UNITS[2];
  const count = Math.floor(diffSecs / unit.seconds);
  return short ? `${count}${unit.short} ago` : `${count} ${unit.long}${count > 1 ? 's' : ''} ago`;
}

const SIZE_UNITS = ['kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const;

/** Size as Finder shows it (decimal units) in the system locale: "731.4 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} bytes`;
  const exponent = Math.min(Math.floor(Math.log10(bytes) / 3), SIZE_UNITS.length);
  const format = new Intl.NumberFormat(undefined, { style: 'unit', unit: SIZE_UNITS[exponent - 1], maximumFractionDigits: 1 });
  return format.format(bytes / 1000 ** exponent);
}

/** A count with its noun: "1 meeting", "12 meetings". */
export function formatCount(count: number, noun: string): string {
  return `${new Intl.NumberFormat().format(count)} ${noun}${count === 1 ? '' : 's'}`;
}

/** A figure's precision: two decimals for most (a price, a share), three significant digits below one, so 0.0031 doesn't
 *  read as 0. */
const FIGURE_DECIMALS = 2;
const SMALL_FIGURE_DIGITS = 3;

/** A figure in the device's locale with its unit: "1,234.5 USD", "-32.53%", "0.00312 USD" (a percent sign hugs the number). */
export function formatFigure(value: number, unit?: string): string {
  const small = value !== 0 && Math.abs(value) < 1;
  const precision = small ? { maximumSignificantDigits: SMALL_FIGURE_DIGITS } : { maximumFractionDigits: FIGURE_DECIMALS };
  const number = new Intl.NumberFormat(systemFormat().locale, precision).format(value);
  if (!unit) return number;
  return unit === '%' ? `${number}%` : `${number} ${unit}`;
}

/** A running clock, fixed width: "02:13", minutes past the hour kept ("75:03"). */
export function formatClock(seconds: number): string {
  const pad = (n: number) => Math.floor(n).toString().padStart(2, '0');
  return `${pad(seconds / 60)}:${pad(seconds % 60)}`;
}

/** A length: "2:13", or "1:02:13" past an hour. */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}:${remainingMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/** Whole calendar days from `now` to `date` (0 today, -1 yesterday, 1 tomorrow), by local date, so DST days count as one. */
export function calendarDayOffset(date: Date | string | number, now: Date = new Date()): number {
  return daysBetween(now, new Date(date));
}

/** A day as lists head it: Today, Yesterday, Tomorrow, else "Mon, Nov 17" (the year only when it isn't this year's). */
export function formatDayLabel(date: Date | string | number, now: Date = new Date()): string {
  const offset = calendarDayOffset(date, now);
  if (offset === 0) return 'Today';
  if (offset === -1) return 'Yesterday';
  if (offset === 1) return 'Tomorrow';
  const d = new Date(date);
  const sameYear = d.getFullYear() === now.getFullYear();
  return format(d, { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** Newest-first items as consecutive day groups headed by `labelOf` (Today, Yesterday, then dates). */
export function groupByLabel<T>(items: readonly T[], labelOf: (item: T) => string): Array<{ label: string; items: T[] }> {
  const groups: Array<{ label: string; items: T[] }> = [];
  for (const item of items) {
    const label = labelOf(item);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}
