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

  /** Page column — Settings and the meeting view share one centred reading width */
  pageColumn: 'max-w-4xl mx-auto w-full',

  /** Plain settings dropdowns (options, sources); model pickers are wider (ModelSelect) */
  settingsSelect: 'w-48',
  /** Settings › Capabilities pickers (model, voice): one column width. */
  capabilityPicker: 'w-64',
  /** A row's model action (Download, 42%, Delete, Re-download): one width, so actions and states align down a card. */
  modelAction: 'w-32',

  /** Meeting title: longer titles end in an ellipsis (full title on hover) so the actions after it stay put */
  meetingTitle: 'max-w-2xl',

  /** Meeting chat mini window: bottom-right, capped below the titlebar on short windows */
  chatPopout: 'fixed bottom-4 right-4 w-[400px] h-[min(600px,calc(100vh-56px))]',

  /** Page gutter around the page column */
  pageGutter: 'px-6 md:px-8',
} as const;

/** Picker row trailing columns — fixed widths so every row's controls line up */
export const PICKER = {
  /** Short facts (a count, a status word, small marks): sized to them and right-aligned against the fixed columns after */
  metaSlot: 'shrink-0 flex items-center justify-end gap-1',
  checkSlot: 'w-4 shrink-0 flex items-center justify-center',
  chevronSlot: 'w-3.5 shrink-0 flex items-center justify-center',
} as const;
