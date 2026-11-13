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
    ? 'bg-paper-100 dark:bg-night-900/90'
    : 'bg-paper-100 dark:bg-night-900',

  /** Left sidebar background */
  sidebar: SUPPORTS_VIBRANCY
    ? 'bg-paper-150 dark:bg-night-950/85'
    : 'bg-paper-150 dark:bg-night-950',

  /** App header bar */
  header: SUPPORTS_VIBRANCY
    ? 'bg-paper-100 dark:bg-night-900/90'
    : 'bg-paper-100 dark:bg-night-900',

  /** Right chat panel */
  chatPanel: SUPPORTS_VIBRANCY
    ? 'bg-paper-100 dark:bg-night-900/90 dark:backdrop-blur-xl'
    : 'bg-paper-100 dark:bg-night-900',

  /** Settings navigation column */
  settingsNav: SUPPORTS_VIBRANCY
    ? 'bg-paper-100 dark:bg-night-950/85 dark:backdrop-blur-xl'
    : 'bg-paper-100 dark:bg-night-950/85',

  /** Modal / dialog background */
  modal: 'bg-paper-50 dark:bg-night-850',

  /** Elevated surfaces (widgets, floating panels) */
  elevated: SUPPORTS_VIBRANCY
    ? 'bg-paper-50 dark:bg-night-850/92 dark:backdrop-blur-xl'
    : 'bg-paper-50 dark:bg-night-850',

  /** Input fields */
  input: 'bg-paper-150/80 dark:bg-night-850/60',

  /** Dropdown menus */
  dropdown: 'bg-paper-50 dark:bg-night-800',

  /** Full-screen overlay backdrop */
  overlay: 'bg-black/60 backdrop-blur-sm',

  /** Subtle hover state for list items */
  hoverSubtle: 'hover:bg-paper-200/80 dark:hover:bg-night-750/80',

  /** Selected item background */
  selected: 'bg-paper-200 dark:bg-night-750/80',

  /** Form input with border (used in settings) */
  inputField: 'bg-paper-50 dark:bg-night-800',

  /** Selected settings card */
  selectedCard: 'bg-paper-200 dark:bg-night-800',

  /** Unselected settings card */
  card: 'bg-paper-50 dark:bg-night-850',

  /** Info / notice callout */
  infoCallout: 'bg-blue-50/50 dark:bg-blue-900/10',

  /** Chip / tag background */
  chip: 'bg-paper-200 dark:bg-night-800',

  /** Subtle content background (model card, file item) */
  subtle: 'bg-paper-150 dark:bg-night-850/50',

  /** Match context callout background */
  matchCallout: 'bg-amber-50/50 dark:bg-yellow-900/10',

  /** Error callout background */
  errorCallout: 'bg-red-50/50 dark:bg-red-900/10',

  /** Warning callout background */
  warningCallout: 'bg-amber-50/50 dark:bg-amber-900/10',

  /** Success callout background */
  successCallout: 'bg-green-50/50 dark:bg-green-900/10',

  /** Tooltip / popover hint background (inverted: dark bg in light mode) */
  tooltip: 'bg-paper-950 dark:bg-night-750 text-paper-50 dark:text-night-200 shadow-lg rounded-md',

  /** Horizontal divider line (use with h-px or w-px) */
  divider: 'bg-paper-300 dark:bg-night-700',

  /** Skeleton loading placeholder */
  skeleton: 'bg-paper-200 dark:bg-night-800/50 animate-pulse',

  /** Inset / recessed container (tool groups, button groups) */
  inset: 'bg-paper-200 dark:bg-night-800/60',
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
  userBubble: 'bg-paper-800 dark:bg-night-800',
  /** User message text */
  userText: 'text-paper-50 dark:text-night-100',
} as const;

// ─── BORDER TOKENS ──────────────────────────────────────────────

export const BORDER = {
  /** Standard dividers */
  default: 'border-paper-300/70 dark:border-night-700',

  /** Panel edges, subtle separators */
  subtle: 'border-paper-300/50 dark:border-night-700',

  /** Divide-y color for list rows (maps to Tailwind divide utilities) */
  divide: 'divide-paper-300/50 dark:divide-night-700',

  /** Modals, dropdowns — stronger emphasis */
  strong: 'border-paper-300 dark:border-night-650',

  /** Glass panel edges (macOS: standard light border, dark: frosted glass line) */
  glass: SUPPORTS_VIBRANCY
    ? 'border-paper-300/50 dark:border-white/10'
    : 'border-paper-300/50 dark:border-night-700',

  /** Form input border */
  input: 'border-paper-400 dark:border-night-650',

  /** Form input focus state */
  inputFocus: 'focus:ring-2 focus:ring-paper-400/50 focus:border-paper-400 dark:focus:ring-night-650 dark:focus:border-night-650',

  /** Selected card border */
  selectedCard: 'border-paper-400 dark:border-night-600',

  /** Card hover border */
  cardHover: 'hover:border-paper-400 dark:hover:border-night-650',

  /** Info callout border */
  infoCallout: 'border-blue-200/50 dark:border-blue-800/30',

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
  primary: 'text-paper-900 dark:text-night-100',

  /** Secondary text (descriptions, captions) */
  secondary: 'text-paper-800 dark:text-night-400',

  /** Muted text (timestamps, helpers) */
  muted: 'text-paper-700 dark:text-night-500',

  /** Faint text (placeholders, icons) */
  faint: 'text-paper-600 dark:text-night-500',

  /** Inverted text (on dark backgrounds) */
  inverted: 'text-white dark:text-night-900',

  /** Headings / titles */
  heading: 'text-paper-950 dark:text-night-50',

  /** Links */
  link: 'text-blue-600 dark:text-blue-400',

  /** Error text */
  error: 'text-red-600 dark:text-red-400',

  /** Success text */
  success: 'text-green-600 dark:text-green-400',

  /** Status active */
  active: 'text-green-600 dark:text-green-400',

  /** Status inactive */
  inactive: 'text-paper-600',

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
    ? 'bg-paper-150 dark:bg-night-950/80'
    : 'bg-paper-150 dark:bg-night-950',
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
  /** Primary action chip (buttons on idle view) */
  // BUG FIX: was `dark:hover:bg-zinc-750` (invalid class)
  chipButton: `inline-flex items-center gap-2 px-4 py-2.5 ${SURFACE.card} border ${BORDER.strong} rounded-full text-sm font-medium ${TEXT.secondary} hover:bg-paper-150 dark:hover:bg-night-750 transition-all`,

  /** Suggestion / prompt button */
  suggestionButton: `w-full text-left p-3 ${SURFACE.card} border ${BORDER.strong} rounded-xl text-sm ${TEXT.secondary} hover:bg-paper-150 dark:hover:bg-night-750 transition-colors`,

  /** Floating scroll-to-bottom button */

  /** Toggle switch active */
  toggleActive: 'bg-green-500 dark:bg-green-600',

  /** Toggle switch inactive */
  toggleInactive: 'bg-paper-400 dark:bg-night-750',

  /** Dropdown menu item hover */
  dropdownItemHover: 'hover:bg-paper-200 dark:hover:bg-night-750',

  /** Dropdown menu item danger (destructive actions) */
  dropdownItemDanger: 'text-red-600 dark:text-red-400 data-[highlighted]:bg-red-50 dark:data-[highlighted]:bg-red-900/20',

  /** Dropdown menu item (text + hover) */
  dropdownItem: 'text-sm hover:bg-paper-200 dark:hover:bg-night-750',

  /** Resize handle */
  resizeHandle: 'bg-paper-300/50 dark:bg-night-650/50',

  /** Resize handle knob */
  resizeHandleKnob: `border ${BORDER.strong} ${SURFACE.inputField}`,

  /** Dropdown menu item base layout */
  dropdownMenuItemBase: 'w-full text-left px-3 py-2 flex items-center gap-2 transition-colors',

  /** Menu button hover state */
  menuButtonHover: 'hover:bg-paper-300/80 dark:hover:bg-night-650/80',

  /** Progress bar track */
  progressTrack: 'bg-paper-300 dark:bg-night-750',

  /** Progress bar fill */
  progressBar: 'bg-paper-900 dark:bg-night-100',

  /** Destructive hover (delete icon buttons) */
  destructiveHover: 'text-paper-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30',

  // ─── Complete Settings Buttons ────────────────────────────────
  // Self-contained: layout + padding + radius + typography + color + disabled.
  // Apply directly to <button> — no assembly required.

  /** Settings inline link (Update, Check for updates, Explore models) */
  settingsLink: `inline-flex items-center gap-1 text-[11.5px] font-normal leading-[1.5] ${TEXT.link} hover:underline disabled:opacity-50 transition-colors`,

  /** Settings destructive link — default state (Remove) */
  settingsDestructiveLink: `inline-flex items-center gap-1 text-[11.5px] font-normal leading-[1.5] ${TEXT.faint} hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors`,

  /** Settings destructive link — confirm state (click again to confirm) */
  settingsDestructiveLinkActive: `inline-flex items-center gap-1 text-[11.5px] font-normal leading-[1.5] text-red-600 dark:text-red-400 disabled:opacity-50 transition-colors`,

  /** Settings muted link — tertiary actions (Check for updates) */
  settingsMutedLink: `inline-flex items-center gap-1 text-[11.5px] font-normal leading-[1.5] ${TEXT.muted} hover:text-paper-900 dark:hover:text-night-100 disabled:opacity-50 transition-colors`,

  /** Keyboard shortcut badge (⌘K, ⌘L, etc.) */
  kbdBadge: `inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] font-medium rounded-md bg-paper-300/80 dark:bg-night-700/80 ${TEXT.faint}`,

  /** Active tab indicator (border-b-2 + text) */
  tabActive: `border-paper-900 dark:border-night-100 ${TEXT.heading}`,

  /** Default/inactive tab state */
  tabDefault: `border-transparent ${TEXT.muted} hover:text-paper-800 dark:hover:text-night-300`,

  /** Status dot — service running (local server list) */
  statusDotRunning: 'shrink-0 w-1.5 h-1.5 rounded-full bg-green-500',

  /** Status dot — service not running */
  statusDotStopped: 'shrink-0 w-1.5 h-1.5 rounded-full bg-paper-400 dark:bg-night-500',

  /** Checkbox box (shared/ui Checkbox); pair with checkboxOn / checkboxOff */
  checkbox: 'inline-flex items-center justify-center shrink-0 w-4 h-4 rounded border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
  checkboxOn: 'bg-paper-900 border-paper-900 text-white dark:bg-night-100 dark:border-night-100 dark:text-night-900',
  checkboxOff: 'border-paper-400 dark:border-night-600 bg-transparent',

  /** Composer picker trigger (model, tools): borderless pill; add state colors at the call site */
  composerPickerTrigger: 'flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all',

  /** Command popover shell: fixed width, never taller than the space Radix measured */
  commandPopover: 'w-80 p-0 flex flex-col max-h-[var(--radix-popover-content-available-height)]',
  /** Its hover flyout (second-level list beside a row). Closes without the
   *  exit animation so moving between rows swaps flyouts instead of overlapping two. */
  commandFlyout: 'w-64 p-0 flex flex-col max-h-[var(--radix-popover-content-available-height)] data-[state=closed]:animate-none',
  /** Scrolling list inside either; shrinks with the shell */
  commandPopoverList: 'max-h-80 min-h-0 flex-1',

  /** Picker row trailing columns — fixed widths so every row's controls line up */
  pickerCheckSlot: 'w-4 shrink-0 flex items-center justify-center',
  pickerChevronSlot: 'w-3.5 shrink-0 flex items-center justify-center',

  /** Server/tool-source icon box (MCP server icon or fallback glyph) */
  serverIcon: 'shrink-0 rounded-sm object-contain',

  /** Count on a composer picker trigger (e.g. enabled tools) */
  countPill: 'inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-semibold leading-none',

  /** Narrow numeric field at the right of a settings CardRow */
  settingsNumberInput: 'w-28',

  /** Wide, height-capped dialog whose body scrolls (forms, JSON editors) */
  dialogScrollable: 'max-w-xl max-h-[85vh] flex flex-col',

  /** Height-capped monospace preview of tool-call arguments */
  argsPreview: `px-3 py-2 text-xs font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto ${RADIUS.md}`,

  /** Monospace JSON editor textarea */
  jsonEditor: 'font-mono text-xs min-h-[18rem] resize-y',
} as const;

// ─── AUDIO PLAYER TOKENS ──────────────────────────────────────

export const AUDIO = {
  /** Outer player shell (no layout/padding — compose externally) */
  shell: `${SURFACE.subtle} border ${BORDER.default} rounded-xl shadow-sm select-none outline-none`,

  /** Player focus ring */
  focusRing: 'focus:ring-2 focus:ring-paper-400/50 dark:focus:ring-night-600/50',

  /** Waveform canvas container */
  waveform: 'h-10 w-full rounded-md overflow-hidden',

  /** Transparent control button (skip, volume icon) */
  controlButton: `w-8 h-8 flex items-center justify-center rounded-full ${TEXT.muted} ${SURFACE.hoverSubtle} hover:${TEXT.primary} transition-all shrink-0`,

  /** Play/pause primary button */
  playButton: 'w-9 h-9 flex items-center justify-center rounded-full bg-paper-900 dark:bg-night-100 text-white dark:text-night-900 shrink-0 shadow-sm hover:shadow-md transition-all',

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
