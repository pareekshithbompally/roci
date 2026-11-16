/** Internal class recipes shared between kit components; not exported, features use components. */

/** Floating panel: base surface, floating elevation (its 0.5px ring is the edge). */
export const FLOATING_SURFACE =
  'z-popover bg-base rounded-lg shadow-floating outline-none data-[state=open]:animate-content-show data-[state=closed]:animate-content-hide';

/** Dialog and AlertDialog sheets. */
export const SCRIM =
  'fixed inset-0 z-modal bg-scrim backdrop-blur-sm data-[state=open]:animate-overlay-show data-[state=closed]:animate-overlay-hide';
/** Modal surface chrome + motion, shared by centred sheets and the top-anchored command palette. */
export const SHEET_SURFACE =
  'z-modal bg-base rounded-xl shadow-overlay focus:outline-none data-[state=open]:animate-sheet-show data-[state=closed]:animate-sheet-hide';
const SHEET_FRAME = `fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full ${SHEET_SURFACE}`;
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

/** One rule for form controls: typing → `FIELD`; choosing from a list → `POPUP_BUTTON` (macOS pop-up button). */

/** Text fields — Input, Textarea. */
export const FIELD =
  'w-full bg-base text-primary text-body placeholder:text-faint shadow-input rounded-md px-3 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50 disabled:cursor-not-allowed';

/** Pop-up buttons — Select, DatePicker and TimePicker triggers: a soft tint, no outline, the same 32px height as a field. */
export const POPUP_BUTTON =
  'h-8 bg-control text-primary text-body rounded-md px-2.5 outline-none transition-colors hover:bg-control-hover data-[state=open]:bg-control-hover focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50 disabled:cursor-not-allowed';
