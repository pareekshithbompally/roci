/**
 * Layout tokens — widths, gutters, measured offsets. Geometry only (no colour,
 * shadow, border or radius), so feature code may import it.
 */

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

  /** Settings content max width — uniform across all panels */
  settingsMaxWidth: 'max-w-4xl',

  /** Settings content padding */
  settingsPadding: 'px-6 md:px-8',
} as const;

/** Picker row trailing columns — fixed widths so every row's controls line up */
export const PICKER = {
  checkSlot: 'w-4 shrink-0 flex items-center justify-center',
  chevronSlot: 'w-3.5 shrink-0 flex items-center justify-center',
} as const;
