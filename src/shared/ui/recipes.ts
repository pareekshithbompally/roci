/**
 * Internal class recipes shared between kit components (not exported by the
 * barrel — features use components, never recipes).
 */

/** Floating panel: base surface, floating elevation (its 0.5px ring is the edge). */
export const FLOATING_SURFACE =
  'z-50 bg-base rounded-lg shadow-floating outline-none data-[state=open]:animate-content-show data-[state=closed]:animate-content-hide';

/** Dialog and AlertDialog sheets. */
export const SCRIM =
  'fixed inset-0 z-50 bg-scrim backdrop-blur-sm data-[state=open]:animate-overlay-show data-[state=closed]:animate-overlay-hide';
const SHEET_FRAME =
  'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full bg-base rounded-xl shadow-overlay focus:outline-none data-[state=open]:animate-content-show data-[state=closed]:animate-content-hide';
export const SHEET = `${SHEET_FRAME} p-6`;
/** Compact sheet for alerts and confirmations: title, one line, buttons. */
export const ALERT_SHEET = `${SHEET_FRAME} max-w-sm p-5`;
export const SHEET_TITLE = 'text-title3 font-semibold text-primary';
export const SHEET_DESCRIPTION = 'text-body text-muted mt-1';

/** Menu list and row — DropdownMenu, Select, Command. */
export const MENU_LIST = `${FLOATING_SURFACE} min-w-36 p-1`;
export const MENU_ITEM =
  'relative flex items-center gap-2 px-2 py-1.5 rounded text-body text-primary cursor-default select-none outline-none transition-colors data-[highlighted]:bg-hover aria-disabled:opacity-50';
export const MENU_LABEL = 'px-2 py-1.5 text-callout font-medium text-faint';
export const MENU_SEPARATOR = 'h-px my-1 bg-separator';

/** Text fields — Input, Textarea, Select trigger. */
export const FIELD =
  'w-full bg-base text-primary text-body placeholder:text-faint shadow-input rounded-md px-3 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50 disabled:cursor-not-allowed';
