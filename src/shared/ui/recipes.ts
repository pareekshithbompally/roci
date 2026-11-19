/** Internal class recipes shared between kit components; not exported, features use components. */

import { cn } from './utils';

/** Floating panel: base surface, floating elevation (its 0.5px ring is the edge). */
export const FLOATING_SURFACE =
  'z-popover bg-base rounded-lg shadow-floating outline-none data-[state=open]:animate-content-show data-[state=closed]:animate-content-hide';

/** Dialog and AlertDialog sheets. */
export const SCRIM =
  'fixed inset-0 z-modal bg-scrim data-[state=open]:animate-overlay-show data-[state=closed]:animate-overlay-hide';
/** Modal surface chrome + motion for centred sheets. */
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
/** A searchable list shown as an iOS screen: results are an inset grouped card — list-height rows, separators inset
 *  like a list's, no hover/selection fill on touch (a press shades the row), group headings above the card's rows. */
export const LIST_COMMAND = cn(
  'overflow-hidden rounded-card bg-grouped-card',
  '[&_[cmdk-item]]:mx-4 [&_[cmdk-item]]:min-h-row [&_[cmdk-item]]:rounded-none [&_[cmdk-item]]:px-0 [&_[cmdk-item]]:py-3',
  '[&_[cmdk-item]+[cmdk-item]]:border-t [&_[cmdk-item]+[cmdk-item]]:border-muted',
  '[&_[cmdk-item][data-selected=true]]:bg-transparent [&_[cmdk-item]:active]:opacity-60',
  '[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:pt-3',
);

/** iOS search field: a rounded filled bar with a magnifier (UISearchBar). */
export const SEARCH_FIELD = 'flex h-control-sm items-center gap-2 rounded-lg bg-control px-2.5 text-muted';

export const MENU_LABEL = 'px-2 py-1.5 text-callout font-medium text-faint';
export const MENU_SEPARATOR = 'h-px my-1 bg-separator';

/** One rule for form controls: typing → `FIELD`; choosing from a list → `POPUP_BUTTON` (macOS pop-up button). */

/** Text fields — Input, Textarea. */
export const FIELD =
  'w-full bg-base text-primary text-body placeholder:text-faint shadow-input rounded-md px-3 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50 disabled:cursor-not-allowed';

/** Pop-up buttons — Select, DatePicker and TimePicker triggers: a soft tint, no outline, the same height as a field (control-md). */
/** macOS 26 pop-up button in a settings row: the value in plain text, then a round ⌃⌄ chip (System Settings). */
export const POPUP_BUTTON =
  'bg-transparent text-primary text-body outline-none focus-within:ring-2 focus-within:ring-focus rounded-md disabled:opacity-50 disabled:cursor-not-allowed';

/** The ⌃⌄ after a pop-up value: a round chip on macOS, a bare glyph on iOS. */
export const POPUP_CHEVRON = { mac: 'h-5 w-5 shrink-0 rounded-full bg-control p-1 text-muted', phone: 'h-3.5 w-3.5 shrink-0 text-muted' } as const;

/** iOS pop-up menu button in a list row: the value in secondary text with ⌃⌄, no box (UIKit `.menu` button). */
export const POPUP_VALUE =
  'bg-transparent text-muted text-body outline-none active:opacity-60 disabled:opacity-50';

/** Content of a panel that already clears the notch and home bar: it sees no safe-area insets. */
export const NO_INSETS = '[--safe-top:0px] [--safe-bottom:0px]';
/** Inside a bottom sheet: the top inset is spent, the home-indicator inset is padded by each scroll area at its end. */
export const NO_TOP_INSET = '[--safe-top:0px]';

/** Text typed as-is (search queries, ids): the keyboard neither capitalises nor corrects it. */
export const LITERAL_TEXT = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } as const;
