/**
 * Theme Design Token System
 *
 * Centralizes all surface, border, text, layout, and component tokens.
 * Platform-aware: macOS gets glass vibrancy treatments, other platforms get solid fallbacks.
 *
 * Pattern: Each token is a complete Tailwind class string (light + dark).
 * Import `SURFACE`, `BORDER`, `TEXT`, `LAYOUT`, `RADIUS`, `SHADOW`, `SPACING`, `COMPONENT` where needed.
 */

import { SUPPORTS_VIBRANCY, IS_MACOS } from '@platform/index';

// ─── SURFACE TOKENS ─────────────────────────────────────────────

export const SURFACE = {
  /** Main page background (light: solid, dark+vibrancy: tinted glass) */
  page: SUPPORTS_VIBRANCY
    ? 'bg-parchment-100 dark:bg-night-900/90'
    : 'bg-parchment-100 dark:bg-night-900',

  /** Left sidebar background */
  sidebar: SUPPORTS_VIBRANCY
    ? 'bg-parchment-150 dark:bg-night-950/85'
    : 'bg-parchment-150 dark:bg-night-950',

  /** App header bar */
  header: SUPPORTS_VIBRANCY
    ? 'bg-parchment-100 dark:bg-night-900/90'
    : 'bg-parchment-100 dark:bg-night-900',

  /** Right chat panel */
  chatPanel: SUPPORTS_VIBRANCY
    ? 'bg-parchment-100 dark:bg-night-900/90 dark:backdrop-blur-xl'
    : 'bg-parchment-100 dark:bg-night-900',

  /** Settings navigation column */
  settingsNav: SUPPORTS_VIBRANCY
    ? 'bg-parchment-100 dark:bg-night-950/85 dark:backdrop-blur-xl'
    : 'bg-parchment-100 dark:bg-night-950/85',

  /** Modal / dialog background */
  modal: 'bg-parchment-50 dark:bg-night-850',

  /** Elevated surfaces (widgets, floating panels) */
  elevated: SUPPORTS_VIBRANCY
    ? 'bg-parchment-50 dark:bg-night-850/92 dark:backdrop-blur-xl'
    : 'bg-parchment-50 dark:bg-night-850',

  /** Input fields */
  input: 'bg-parchment-150/80 dark:bg-night-850/60',

  /** Dropdown menus */
  dropdown: 'bg-parchment-50 dark:bg-night-800',

  /** Full-screen overlay backdrop */
  overlay: 'bg-black/60 backdrop-blur-sm',

  /** Subtle hover state for list items */
  hoverSubtle: 'hover:bg-parchment-200/80 dark:hover:bg-night-750/80',

  /** Sidebar item hover background (dark: night-700 = #2a2a2a ≈ RGB 40,40,40) */
  sidebarItemHover: 'hover:bg-parchment-200/70 dark:hover:bg-night-700/90',

  /** Selected item background */
  selected: 'bg-parchment-200 dark:bg-night-750/80',

  /** Form input with border (used in settings) */
  inputField: 'bg-parchment-50 dark:bg-night-800',

  /** Selected settings card */
  selectedCard: 'bg-parchment-200 dark:bg-night-800',

  /** Unselected settings card */
  card: 'bg-parchment-50 dark:bg-night-850',

  /** Info / notice callout */
  infoCallout: 'bg-blue-50/50 dark:bg-blue-900/10',

  /** Chip / tag background */
  chip: 'bg-parchment-200 dark:bg-night-800',

  /** Subtle content background (model card, file item) */
  subtle: 'bg-parchment-150 dark:bg-night-850/50',

  /** Match context callout background */
  matchCallout: 'bg-amber-50/50 dark:bg-yellow-900/10',

  /** Error callout background */
  errorCallout: 'bg-red-50/50 dark:bg-red-900/10',

  /** Warning callout background */
  warningCallout: 'bg-amber-50/50 dark:bg-amber-900/10',

  /** Success callout background */
  successCallout: 'bg-green-50/50 dark:bg-green-900/10',

  /** Tooltip / popover hint background (inverted: dark bg in light mode) */
  tooltip: 'bg-parchment-950 dark:bg-night-750 text-parchment-50 dark:text-night-200 shadow-lg rounded-md',

  /** Horizontal divider line (use with h-px or w-px) */
  divider: 'bg-parchment-300 dark:bg-night-700',

  /** Skeleton loading placeholder */
  skeleton: 'bg-parchment-200 dark:bg-night-800/50 animate-pulse',

  /** Inset / recessed container (tool groups, button groups) */
  inset: 'bg-parchment-200 dark:bg-night-800/60',
} as const;

// ─── TIER TOKENS (quality / rating badges) ──────────────────────

export const TIER = {
  low: {
    bg: 'bg-orange-100 dark:bg-orange-900/20',
    text: 'text-orange-700 dark:text-orange-400',
    label: 'Low',
  },
  medium: {
    bg: 'bg-yellow-100 dark:bg-yellow-900/20',
    text: 'text-yellow-700 dark:text-yellow-400',
    label: 'Medium',
  },
  high: {
    bg: 'bg-green-100 dark:bg-green-900/20',
    text: 'text-green-700 dark:text-green-400',
    label: 'Good',
  },
  'very-high': {
    bg: 'bg-blue-100 dark:bg-blue-900/20',
    text: 'text-blue-700 dark:text-blue-400',
    label: 'Great',
  },
  lossless: {
    bg: 'bg-purple-100 dark:bg-purple-900/20',
    text: 'text-purple-700 dark:text-purple-400',
    label: 'Lossless',
  },
} as const;

// ─── ACCENT TOKENS ─────────────────────────────────────────────

export const ACCENT = {
  /** User message bubble */
  userBubble: 'bg-parchment-800 dark:bg-night-800',
  /** User message text */
  userText: 'text-parchment-50 dark:text-night-100',
} as const;

// ─── BORDER TOKENS ──────────────────────────────────────────────

export const BORDER = {
  /** Standard dividers */
  default: 'border-parchment-300/70 dark:border-night-700',

  /** Panel edges, subtle separators */
  subtle: 'border-parchment-300/50 dark:border-night-700',

  /** Divide-y color for list rows (maps to Tailwind divide utilities) */
  divide: 'divide-parchment-300/50 dark:divide-night-700',

  /** Modals, dropdowns — stronger emphasis */
  strong: 'border-parchment-300 dark:border-night-650',

  /** Glass panel edges (macOS: standard light border, dark: frosted glass line) */
  glass: SUPPORTS_VIBRANCY
    ? 'border-parchment-300/50 dark:border-white/10'
    : 'border-parchment-300/50 dark:border-night-700',

  /** Form input border */
  input: 'border-parchment-400 dark:border-night-650',

  /** Form input focus state */
  inputFocus: 'focus:ring-2 focus:ring-parchment-400/50 focus:border-parchment-400 dark:focus:ring-night-650 dark:focus:border-night-650',

  /** Selected card border */
  selectedCard: 'border-parchment-400 dark:border-night-600',

  /** Card hover border */
  cardHover: 'hover:border-parchment-400 dark:hover:border-night-650',

  /** Info callout border */
  infoCallout: 'border-blue-200/50 dark:border-blue-800/30',

  /** Selected sidebar item */
  selectedItem: 'border-parchment-300/70 dark:border-night-650/70',

  /** Match context callout border */
  matchCallout: 'border-amber-100/50 dark:border-yellow-900/30',

  /** Error callout border */
  errorCallout: 'border-red-200/50 dark:border-red-800/30',

  /** Warning callout border */
  warningCallout: 'border-amber-200/50 dark:border-amber-800/30',

  /** Success callout border */
  successCallout: 'border-green-200/50 dark:border-green-800/30',
} as const;

// ─── TEXT TOKENS ────────────────────────────────────────────────

export const TEXT = {
  /** Primary body text */
  primary: 'text-parchment-900 dark:text-night-100',

  /** Secondary text (descriptions, captions) */
  secondary: 'text-parchment-800 dark:text-night-400',

  /** Muted text (timestamps, helpers) */
  muted: 'text-parchment-700 dark:text-night-500',

  /** Faint text (placeholders, icons) */
  faint: 'text-parchment-600 dark:text-night-500',

  /** Inverted text (on dark backgrounds) */
  inverted: 'text-white dark:text-night-900',

  /** Headings / titles */
  heading: 'text-parchment-950 dark:text-night-50',

  /** Links */
  link: 'text-blue-600 dark:text-blue-400',

  /** Error text */
  error: 'text-red-600 dark:text-red-400',

  /** Success text */
  success: 'text-green-600 dark:text-green-400',

  /** Status active */
  active: 'text-green-600 dark:text-green-400',

  /** Status inactive */
  inactive: 'text-parchment-600',

  /** Info callout text */
  infoCallout: 'text-blue-800 dark:text-blue-200',

  /** Error callout text */
  errorCallout: 'text-red-800 dark:text-red-200',

  /** Warning callout text */
  warningCallout: 'text-amber-800 dark:text-amber-200',

  /** Success callout text */
  successCallout: 'text-green-800 dark:text-green-200',
} as const;

// ─── LAYOUT TOKENS ──────────────────────────────────────────────

export const LAYOUT = {
  /** Sidebar outer shell — macOS: floating with rounding + margin; others: card-style */
  sidebarShell: IS_MACOS
    ? 'p-2 pr-0'
    : 'rounded-lg m-1 mr-0',

  /** Sidebar inner container */
  sidebarInner: IS_MACOS
    ? `h-full w-full overflow-hidden rounded-xl border ${BORDER.glass}`
    : `h-full w-full overflow-hidden rounded-lg border ${BORDER.subtle}`,

  /** Settings content max width — uniform across all panels */
  settingsMaxWidth: 'max-w-4xl',

  /** Settings content padding */
  settingsPadding: 'px-6 md:px-8',

  /** Sidebar inner background */
  sidebarInnerBg: IS_MACOS
    ? 'bg-parchment-150 dark:bg-night-950/80'
    : 'bg-parchment-150 dark:bg-night-950',
} as const;

// ─── STRUCTURAL TOKENS ─────────────────────────────────────────

export const RADIUS = {
  /** Inputs, buttons, small cards */
  md: 'rounded-lg',
  /** Larger cards, selection cards, callouts */
  lg: 'rounded-xl',
  /** Modals */
  xl: 'rounded-2xl',
} as const;

export const SHADOW = {
  /** Dropdowns, floating save button */
  float: 'shadow-lg',
  /** Modals, dialogs */
  modal: 'shadow-2xl',
} as const;

export const SPACING = {
  /** Standard button padding */
  button: 'px-3 py-2',
  /** Primary/larger button padding */
  buttonLg: 'px-4 py-2.5',
  /** Small/compact button padding */
  buttonSm: 'px-3 py-1.5',
  /** Standard input padding */
  input: 'px-3 py-2.5',
  /** Card/list item padding */
  card: 'px-3 py-2.5',
  /** Section card padding (callouts, info boxes) */
  callout: 'px-4 py-3',
  /** Gap between sections */
  sectionGap: 'space-y-8',
  /** Gap between fields within a section */
  fieldGap: 'space-y-3',
} as const;

// ─── COMPONENT TOKENS ───────────────────────────────────────────

export const COMPONENT = {
  /** Standard icon button (header, toolbar) */
  iconButton: `p-2 ${TEXT.muted} hover:text-parchment-900 dark:hover:text-night-100 transition-colors rounded-xl ${SURFACE.hoverSubtle}`,

  /** Small icon button (action bars) */
  iconButtonSm: `p-1.5 ${TEXT.faint} hover:text-parchment-800 dark:hover:text-night-300 rounded-lg transition-colors`,

  /** Active send button */
  sendButtonActive: 'bg-parchment-900 dark:bg-night-100 text-white dark:text-night-900 hover:bg-parchment-800 dark:hover:bg-night-200 shadow-lg',

  /** Disabled send button */
  sendButtonDisabled: 'bg-parchment-300 dark:bg-night-750 text-parchment-600 dark:text-night-600 cursor-not-allowed',

  /** Stop / cancel button */
  stopButton: 'bg-red-500 hover:bg-red-600 text-white shadow-lg',

  /** Settings nav selected state */
  settingsNavSelected: `${SURFACE.selected} ${TEXT.primary}`,

  /** Settings nav default state */
  settingsNavDefault: `${TEXT.secondary} hover:bg-parchment-200/70 dark:hover:bg-night-800/50`,

  /** Sidebar item selected state */
  sidebarItemSelected: `${SURFACE.selected} ${BORDER.selectedItem}`,

  /** Sidebar item default state */
  sidebarItemDefault: `border-transparent ${SURFACE.sidebarItemHover} hover:border-parchment-300/40 dark:hover:border-night-700/40`,

  /** Primary action chip (buttons on idle view) */
  // BUG FIX: was `dark:hover:bg-zinc-750` (invalid class)
  chipButton: `inline-flex items-center gap-2 px-4 py-2.5 ${SURFACE.card} border ${BORDER.strong} rounded-full text-sm font-medium ${TEXT.secondary} hover:bg-parchment-150 dark:hover:bg-night-750 transition-all`,

  /** Suggestion / prompt button */
  suggestionButton: `w-full text-left p-3 ${SURFACE.card} border ${BORDER.strong} rounded-xl text-sm ${TEXT.secondary} hover:bg-parchment-150 dark:hover:bg-night-750 transition-colors`,

  /** Floating scroll-to-bottom button */
  floatingButton: 'w-8 h-8 flex items-center justify-center rounded-full bg-parchment-900 dark:bg-night-100 text-white dark:text-night-900 shadow-lg hover:scale-110 transition-transform',

  /** Toggle switch active */
  toggleActive: 'bg-green-500 dark:bg-green-600',

  /** Toggle switch inactive */
  toggleInactive: 'bg-parchment-400 dark:bg-night-750',

  /** Dropdown menu item hover */
  dropdownItemHover: 'hover:bg-parchment-200 dark:hover:bg-night-750',

  /** Dropdown menu item danger (destructive actions) */
  dropdownItemDanger: 'text-red-600 dark:text-red-400 data-[highlighted]:bg-red-50 dark:data-[highlighted]:bg-red-900/20',

  /** Dropdown menu item (text + hover) */
  dropdownItem: 'text-sm hover:bg-parchment-200 dark:hover:bg-night-750',

  /** Resize handle */
  resizeHandle: 'bg-parchment-300/50 dark:bg-night-650/50',

  /** Resize handle knob */
  resizeHandleKnob: `border ${BORDER.strong} ${SURFACE.inputField}`,

  /** Toolbar button (attachment, web search default) */
  toolbarButton: 'flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-parchment-200 dark:bg-night-800 text-parchment-800 dark:text-night-400 hover:bg-parchment-300 dark:hover:bg-night-750 transition-all',

  /** Web search toggle active */
  toolbarButtonActive: 'flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-all',

  /** Primary CTA button (search, add, save) */
  primaryButton: 'bg-parchment-900 dark:bg-night-100 text-white dark:text-night-900 hover:bg-parchment-800 dark:hover:bg-night-200 transition-colors',

  /** Secondary button (cancel, later) */
  secondaryButton: 'bg-parchment-200 dark:bg-night-800 hover:bg-parchment-300 dark:hover:bg-night-750 text-parchment-800 dark:text-night-300 transition-all',

  /** Danger button */
  dangerButton: 'bg-red-600 hover:bg-red-700 text-white transition-all shadow-lg shadow-red-500/20',

  /** Dropdown menu item base layout */
  dropdownMenuItemBase: 'w-full text-left px-3 py-2 flex items-center gap-2 transition-colors',

  /** Menu button hover state */
  menuButtonHover: 'hover:bg-parchment-300/80 dark:hover:bg-night-650/80',

  /** Sidebar item active/press state */
  sidebarItemActive: 'active:bg-parchment-300/80 dark:active:bg-night-650/60',

  /** Success action button (start server, confirm) */
  successButton: 'bg-green-600 hover:bg-green-700 text-white transition-colors',

  /** Accent/save button (blue CTA for save actions) */
  accentButton: 'bg-blue-600 hover:bg-blue-700 text-white transition-colors',

  /** Accent button disabled state */
  accentButtonDisabled: 'bg-parchment-300 dark:bg-night-750 text-parchment-700 dark:text-night-600 cursor-not-allowed',

  /** Progress bar track */
  progressTrack: 'bg-parchment-300 dark:bg-night-750',

  /** Progress bar fill */
  progressBar: 'bg-parchment-900 dark:bg-night-100',

  /** Destructive hover (delete icon buttons) */
  destructiveHover: 'text-parchment-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30',

  /** Standard settings input field (surface + border + focus + radius) */
  settingsInput: `${SURFACE.inputField} border ${BORDER.input} ${RADIUS.md} outline-none ${BORDER.inputFocus} transition-all`,

  /** Disabled input modifier */
  inputDisabled: 'disabled:opacity-50 disabled:cursor-not-allowed',

  // ─── Complete Settings Buttons ────────────────────────────────
  // Self-contained: layout + padding + radius + typography + color + disabled.
  // Apply directly to <button> — no assembly required.

  /** Settings button — primary filled (Download, Search, Add) */
  settingsButtonPrimary: `inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium leading-[1.4] ${RADIUS.md} bg-parchment-900 dark:bg-night-100 text-white dark:text-night-900 hover:bg-parchment-800 dark:hover:bg-night-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors`,

  /** Settings button — success filled (Start Server) */
  settingsButtonSuccess: `inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium leading-[1.4] ${RADIUS.md} bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors`,

  /** Settings button — danger filled (Stop Server) */
  settingsButtonDanger: `inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium leading-[1.4] ${RADIUS.md} bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors`,

  /** Settings button — outline (Cancel, Rebuild, secondary actions) */
  settingsButtonOutline: `inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium leading-[1.4] ${RADIUS.md} border ${BORDER.strong} ${TEXT.primary} ${SURFACE.hoverSubtle} disabled:opacity-50 disabled:cursor-not-allowed transition-colors`,

  /** Settings inline link (Update, Check for updates, Explore models) */
  settingsLink: `inline-flex items-center gap-1 text-[11.5px] font-normal leading-[1.5] ${TEXT.link} hover:underline disabled:opacity-50 transition-colors`,

  /** Settings destructive link — default state (Remove) */
  settingsDestructiveLink: `inline-flex items-center gap-1 text-[11.5px] font-normal leading-[1.5] ${TEXT.faint} hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors`,

  /** Settings destructive link — confirm state (click again to confirm) */
  settingsDestructiveLinkActive: `inline-flex items-center gap-1 text-[11.5px] font-normal leading-[1.5] text-red-600 dark:text-red-400 disabled:opacity-50 transition-colors`,

  /** Settings muted link — tertiary actions (Check for updates) */
  settingsMutedLink: `inline-flex items-center gap-1 text-[11.5px] font-normal leading-[1.5] ${TEXT.muted} hover:text-parchment-900 dark:hover:text-night-100 disabled:opacity-50 transition-colors`,

  /** Keyboard shortcut badge (⌘K, ⌘L, etc.) */
  kbdBadge: `inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] font-medium rounded-md bg-parchment-300/80 dark:bg-night-700/80 ${TEXT.faint}`,

  /** Active tab indicator (border-b-2 + text) */
  tabActive: `border-parchment-900 dark:border-night-100 ${TEXT.heading}`,

  /** Default/inactive tab state */
  tabDefault: `border-transparent ${TEXT.muted} hover:text-parchment-800 dark:hover:text-night-300`,

  /** Inline edit input (notes, todos, history rename) */
  inlineInput: `${SURFACE.inputField} border ${BORDER.input} ${RADIUS.md} text-sm ${TEXT.primary} outline-none ${BORDER.inputFocus} resize-none`,

  /** Clickable list row (suggestions, sources, history items) */
  listRow: `flex items-center gap-2.5 text-left w-full px-3 py-2.5 text-sm ${TEXT.secondary} hover:text-parchment-900 dark:hover:text-night-200 ${SURFACE.hoverSubtle} rounded-lg transition-colors cursor-pointer`,

  /** Recommended badge (green pill) */
  recommendedBadge: 'px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-[10px] font-medium',
} as const;

// ─── AUDIO PLAYER TOKENS ──────────────────────────────────────

export const AUDIO = {
  /** Outer player shell (no layout/padding — compose externally) */
  shell: `${SURFACE.subtle} border ${BORDER.default} rounded-xl shadow-sm select-none outline-none`,

  /** Player focus ring */
  focusRing: 'focus:ring-2 focus:ring-parchment-400/50 dark:focus:ring-night-600/50',

  /** Waveform canvas container */
  waveform: 'h-10 w-full rounded-md overflow-hidden',

  /** Transparent control button (skip, volume icon) */
  controlButton: `w-8 h-8 flex items-center justify-center rounded-full ${TEXT.muted} ${SURFACE.hoverSubtle} hover:${TEXT.primary} transition-all shrink-0`,

  /** Play/pause primary button */
  playButton: `w-9 h-9 flex items-center justify-center rounded-full ${COMPONENT.primaryButton} shrink-0 shadow-sm hover:shadow-md transition-all`,

  /** Speed trigger pill */
  speedTrigger: `h-7 px-2 flex items-center justify-center rounded-md text-[11px] font-mono font-medium ${TEXT.muted} ${SURFACE.hoverSubtle} hover:${TEXT.primary} transition-all`,

  /** Popover surface (volume slider, speed menu) */
  popover: `${SURFACE.dropdown} border ${BORDER.default} shadow-lg`,

  /** Popover menu item base */
  popoverItem: 'block w-full text-left px-3 py-1.5 text-xs font-mono rounded-md transition-colors',

  /** Popover menu item — selected state */
  popoverItemSelected: `${SURFACE.selected} ${TEXT.primary}`,

  /** Popover menu item — default state */
  popoverItemDefault: `${TEXT.muted} ${SURFACE.hoverSubtle}`,

  /** Volume slider track */
  volumeSlider: `${COMPONENT.progressTrack} h-24 w-1.5 appearance-none rounded-full cursor-pointer [writing-mode:vertical-lr] direction-rtl`,

  /** Time label */
  timeLabel: `text-xs font-mono tabular-nums ${TEXT.muted}`,

  /** Time label interactive (elapsed/remaining toggle) */
  timeLabelInteractive: `text-xs font-mono tabular-nums min-w-[4.5rem] text-left ${TEXT.muted} hover:${TEXT.primary} cursor-pointer transition-colors`,

  /** Duration label (right-aligned, not interactive) */
  timeLabelDuration: `text-xs font-mono tabular-nums min-w-[4.5rem] text-right ${TEXT.muted}`,
} as const;
