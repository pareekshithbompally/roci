/** Internal class recipes shared between kit components; not exported, features use components. */

import { cn } from './utils';

/** The one surface every menu and popover floats on, Mac and iPhone (iOS's own menu): frosted glass over a blur, a card's
 *  corners, the floating shadow; it pops out of the control that opened it (Radix's transform origin) and shrinks back into
 *  it, on the move spring. */
const POP_ORIGIN = 'origin-[var(--radix-popover-content-transform-origin,var(--radix-dropdown-menu-content-transform-origin,center))]';
export const FLOATING_SURFACE = cn(
  'z-popover overflow-hidden rounded-card bg-menu shadow-floating outline-none backdrop-blur-2xl backdrop-saturate-150',
  POP_ORIGIN,
  'data-[state=open]:animate-menu-pop-show data-[state=closed]:animate-menu-pop-hide',
);

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
/** A menu row's look, without its box. */
const MENU_ROW_LOOK = 'relative flex items-center text-body text-primary cursor-default select-none outline-none transition-colors aria-disabled:opacity-50';
const MENU_ROW = `${MENU_ROW_LOOK} gap-2 data-[highlighted]:bg-hover`;
export const MENU_ITEM = `${MENU_ROW} px-2 py-1.5 rounded`;
/** The drawn menu on a touch screen (iOS's button menu, UIMenu): its glass material over a blur, a card's corners, popping
 *  out of the button it came from; 44 pt rows edge to edge, a hairline between rows, a band between groups, the icon at the
 *  trailing edge, a press shading the row. Whole recipes, not additions: classes don't merge. */
export const MENU_TOUCH = {
  list: cn(
    FLOATING_SURFACE,
    'min-w-60 [&_[role^=menuitem]+[role^=menuitem]]:border-t [&_[role^=menuitem]+[role^=menuitem]]:border-muted',
  ),
  item: `${MENU_ROW_LOOK} min-h-11 gap-3 px-4 data-[highlighted]:bg-pressed`,
  separator: 'h-2 bg-menu-gap',
} as const;
/** The grouped card surface (System Settings): what every card, table and KPI tile sits on. */
export const GROUPED_SURFACE = 'rounded-card bg-grouped-card';

/** A picker list shown as an iOS screen (Settings): each group an inset grouped card with its title above it, a section's
 *  gap between groups; list-height rows, separators inset like a list's, no hover/selection fill on touch (a press shades
 *  the row). A picker's rows always sit in a group. */
export const LIST_COMMAND = cn(
  '[&_[cmdk-list-sizer]]:flex [&_[cmdk-list-sizer]]:flex-col [&_[cmdk-list-sizer]]:gap-section',
  '[&_[cmdk-group-items]]:overflow-hidden [&_[cmdk-group-items]]:rounded-card [&_[cmdk-group-items]]:bg-grouped-card',
  '[&_[cmdk-item]]:mx-4 [&_[cmdk-item]]:min-h-row [&_[cmdk-item]]:rounded-none [&_[cmdk-item]]:px-0 [&_[cmdk-item]]:py-3',
  '[&_[cmdk-item]+[cmdk-item]]:border-t [&_[cmdk-item]+[cmdk-item]]:border-muted',
  '[&_[cmdk-item][data-selected=true]]:bg-transparent [&_[cmdk-item]:active]:opacity-60',
  '[&_[cmdk-group-heading]]:px-4',
  // The gap between cards already parts groups.
  '[&_[cmdk-separator]]:hidden',
);

/** iOS search field: a rounded filled bar with a magnifier (UISearchBar). */
/** The system search field: a filled capsule (iOS 26 and macOS 26 alike). */
export const SEARCH_FIELD = 'flex h-control-sm items-center gap-2 rounded-full bg-control px-3 text-muted';

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
