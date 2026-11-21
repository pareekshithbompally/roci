/** Layout geometry tokens (widths, gutters, measured offsets) that feature code may import. */

// ─── LAYOUT TOKENS ──────────────────────────────────────────────

export const LAYOUT = {
  /** Sidebar outer shell — flush, full height (no floating card, inset or border) */
  sidebarShell: 'h-full',

  /** Chat reading column — landing composer, messages and chat composer share these edges */
  chatColumn: 'w-full max-w-3xl mx-auto',

  /** Sidebar header — icon buttons centered on the macOS traffic lights (y≈30): 15px + 28px/2 */
  sidebarHeader: 'flex items-center justify-end gap-0.5 shrink-0 px-2 pt-[15px] pb-2',

  /** Collapsed-sidebar buttons: clear of the macOS traffic lights (measured) / flush when there are none */
  collapsedControls: 'left-[88px]',
  collapsedControlsFlush: 'left-3',

  /** A pane's toolbar in the macOS titlebar: 28px controls centred on the traffic lights (y≈29: 15px + 28px/2), like the
   *  sidebar header, the page below fades in under it (PageScroll `fadeTop`); `clearFloating` starts it after the sidebar's floating buttons (left-[88px] + two 32px buttons + gap). */
  paneToolbar: { base: 'relative z-30', titlebar: 'pt-[15px] pb-3 h-[55px]', plain: 'pt-6 pb-3', clearFloating: 'pl-[136px]' },

  /** Proposal cards above the chat box: past a few rows the list scrolls inside the card. */
  proposalList: 'max-h-64 overflow-y-auto',

  /** Page column — the meeting view's centred reading width */
  pageColumn: 'max-w-4xl mx-auto w-full',
  /** Settings panes: one tighter centred column for every pane and drilled-in page (macOS System Settings proportions). */
  settingsColumn: 'max-w-2xl mx-auto w-full',
  /** A box a page column sits in that doesn't scroll (a page's toolbar): it keeps the scrollbar's room like the `steady`
   *  PageScroll below it, so the column lines up under its title and never shifts between pages. */
  pageColumnFrame: 'custom-scrollbar overflow-y-scroll',

  /** Plain settings pop-ups (options, sources): they hug their value up to this width, right-aligned in the row */
  settingsSelect: 'max-w-48',
  /** Settings › Default Models pickers (model, voice): hug their value up to this width, right-aligned in the row */
  capabilityPicker: 'max-w-64',
  /** A row's model action (Download, 42%, Delete): one width, so actions and states align down a card. */
  modelAction: 'w-32',
  /** A row's model size, just before its action: one width, right-aligned, so sizes line up down a card. */
  modelSize: 'w-20 text-right',

  /** Meeting title: longer titles end in an ellipsis (full title on hover) so the actions after it stay put */
  meetingTitle: 'max-w-2xl',

  /** Room under a meeting tab's last line, so the meeting chat button (kit `fab`, 44px, `UI_CONFIG.layout.meetingChat.inset` from the edge) never covers it */
  meetingChatClearance: 'pb-16',

  /** Page gutter around the page column */
  pageGutter: 'px-6 md:px-8',

  /** Gutter of a full-width list page (To-dos): header, group labels and rows share it, so they line up */
  listGutter: 'px-5',
} as const;

/** The ⌘K command palette: where it sits and how wide, and its list's one fixed height (it never resizes as you type). */
export const COMMAND_PALETTE = {
  frame: 'left-1/2 top-[18vh] w-full max-w-2xl -translate-x-1/2',
  listHeight: 'h-96',
} as const;

/** Picker row trailing columns — fixed widths so every row's controls line up */
export const PICKER = {
  /** Short facts (a count, a status word, small marks): sized to them and right-aligned against the fixed columns after */
  metaSlot: 'shrink-0 flex items-center justify-end gap-1',
  checkSlot: 'w-4 shrink-0 flex items-center justify-center',
  chevronSlot: 'w-3.5 shrink-0 flex items-center justify-center',
} as const;
