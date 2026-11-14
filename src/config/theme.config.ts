/**
 * Theme recipes — named Tailwind class strings built only from the semantic roles
 * in src/styles/tokens.css (mapped in tailwind.config.js). No raw colours, no `dark:`:
 * the `.dark` class on <html> swaps the roles. macOS only — vibrancy comes from the
 * `*-glass` roles, so there are no platform branches here.
 *
 * Plan: docs/plans/IN-PROGRESS/design-system/plan.md §3–§4.
 */

// ─── SURFACE TOKENS ─────────────────────────────────────────────

export const SURFACE = {
  /** Main page background (window material shows through in dark) */
  page: 'bg-base-glass',
  /** Left sidebar background */
  sidebar: 'bg-deep-glass',
  /** Right chat panel */
  chatPanel: 'bg-base-glass backdrop-blur-xl',
  /** Modal / dialog background */
  modal: 'bg-base',
  /** Elevated surfaces (widgets, floating panels) */
  elevated: 'bg-raised-glass backdrop-blur-xl',
  /** Input fields */
  input: 'bg-base shadow-input',
  /** Dropdown menus */
  dropdown: 'bg-base',
  /** Full-screen overlay backdrop */
  overlay: 'bg-scrim backdrop-blur-sm',
  /** Subtle hover state for list items */
  hoverSubtle: 'hover:bg-hover',
  /** Selected item background */
  selected: 'bg-pressed',
  /** Form input with border (used in settings) */
  inputField: 'bg-base',
  /** Selected settings card */
  selectedCard: 'bg-layer-1',
  /** Unselected settings card */
  card: 'bg-base',
  /** Chip / tag background */
  chip: 'bg-layer-2',
  /** Subtle content background (model card, file item) */
  subtle: 'bg-layer-1',
  /** Match context callout background */
  matchCallout: 'bg-warning-subtle',
  /** Error callout background */
  errorCallout: 'bg-danger-subtle',
  /** Success callout background */
  successCallout: 'bg-success-subtle',
  /** Horizontal divider line (use with h-px or w-px) */
  divider: 'bg-separator',
  /** Skeleton loading placeholder */
  skeleton: 'bg-layer-2 animate-pulse',
  /** Inset / recessed container (tool groups, button groups) */
  inset: 'bg-layer-2',
} as const;

// ─── ACCENT TOKENS ─────────────────────────────────────────────

export const ACCENT = {
  /** User message bubble */
  userBubble: 'bg-layer-2',
  /** User message text */
  userText: 'text-primary',
} as const;

// ─── BORDER TOKENS ──────────────────────────────────────────────

export const BORDER = {
  /** Standard dividers */
  default: 'border-muted',
  /** Panel edges, subtle separators */
  subtle: 'border-muted',
  /** Divide-y color for list rows */
  divide: 'divide-muted',
  /** Modals, dropdowns — stronger emphasis */
  strong: 'border-base',
  /** Glass panel edges */
  glass: 'border-muted',
  /** Form input border */
  input: 'border-base',
  /** Form input focus state */
  inputFocus: 'focus:ring-2 focus:ring-focus focus:border-focus',
  /** Selected card border */
  selectedCard: 'border-strong',
  /** Card hover border */
  cardHover: 'hover:border-strong',
  /** Match context callout border */
  matchCallout: 'border-warning',
  /** Error callout border */
  errorCallout: 'border-danger',
  /** Success callout border */
  successCallout: 'border-success',
} as const;

// ─── TEXT TOKENS ────────────────────────────────────────────────

export const TEXT = {
  /** Primary body text */
  primary: 'text-primary',
  /** Secondary text (descriptions, captions) */
  secondary: 'text-muted',
  /** Muted text (timestamps, helpers) */
  muted: 'text-muted',
  /** Faint text (placeholders, icons) */
  faint: 'text-faint',
  /** Headings / titles */
  heading: 'text-primary',
  /** Links */
  link: 'text-accent',
  /** Error text */
  error: 'text-danger',
  /** Success text */
  success: 'text-success',
  /** Meeting status icons in list rows */
  statusTranscribing: 'text-ai',
  statusPlaying: 'text-success',
  statusPending: 'text-warning',
  /** Error callout text */
  errorCallout: 'text-danger',
  /** Warning callout text */
  warningCallout: 'text-warning',
} as const;

// ─── STRUCTURAL TOKENS ─────────────────────────────────────────

export const RADIUS = {
  /** Menu/list rows, inner chips (4px) */
  sm: 'rounded',
  /** Buttons, inputs, chips, picker triggers (6px) */
  md: 'rounded-md',
  /** Cards, sidebar rows, floating panels (8px) */
  lg: 'rounded-lg',
  /** Modals, composer shell (12px) */
  xl: 'rounded-xl',
  /** Pills and circles */
  full: 'rounded-full',
} as const;

export const SHADOW = {
  /** Dropdowns, floating save button */
  float: 'shadow-floating',
} as const;

export const SPACING = {
  /** Card/list item padding */
  card: 'px-3 py-2.5',
  /** Gap between fields within a section */
  fieldGap: 'space-y-3',
} as const;

// ─── COMPONENT TOKENS ───────────────────────────────────────────

export const COMPONENT = {
  /** Dropdown menu item hover */
  dropdownItemHover: 'hover:bg-hover',

  /** Dropdown menu item danger (destructive actions) */
  dropdownItemDanger: 'text-danger data-[highlighted]:bg-danger-subtle',

  /** Resize handle */
  resizeHandle: 'bg-separator',

  /** Menu button hover state */
  menuButtonHover: 'hover:bg-pressed',

  /** Progress bar track */
  progressTrack: 'bg-layer-3',

  /** Destructive hover (delete icon buttons) */
  destructiveHover: 'text-faint hover:text-danger hover:bg-danger-subtle',

  // ─── Complete Settings Buttons ────────────────────────────────
  // Self-contained: layout + padding + radius + typography + color + disabled.

  /** Settings inline link (Update, Check for updates, Explore models) */
  settingsLink: `inline-flex items-center gap-1 text-callout ${TEXT.link} hover:underline disabled:opacity-50 transition-colors`,

  /** Settings muted link — tertiary actions (Check for updates) */
  settingsMutedLink: `inline-flex items-center gap-1 text-callout ${TEXT.muted} hover:text-primary disabled:opacity-50 transition-colors`,

  /** Row title that fades out under the trailing action instead of reflowing (ChatGPT/shadcn pattern) */
  rowTitleUnderAction: 'group-hover/row:[mask-image:linear-gradient(to_left,transparent_28px,black_48px)] group-focus-within/row:[mask-image:linear-gradient(to_left,transparent_28px,black_48px)] group-has-[[data-state=open]]/row:[mask-image:linear-gradient(to_left,transparent_28px,black_48px)]',

  /** Record action marker — small red dot */
  recordDot: 'shrink-0 w-2 h-2 rounded-full bg-danger',

  /** Status dot — service running (local server list) */
  statusDotRunning: 'shrink-0 w-1.5 h-1.5 rounded-full bg-success',

  /** Status dot — service not running */
  statusDotStopped: 'shrink-0 w-1.5 h-1.5 rounded-full bg-layer-4',

  /** Composer picker trigger (model, tools): borderless pill; add state colors at the call site */
  composerPickerTrigger: `flex items-center gap-1.5 px-2 py-1 ${RADIUS.md} transition-all`,

  /** Count on a composer picker trigger (e.g. enabled tools) */
  countPill: 'inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-subheadline font-semibold leading-none',

  /** Narrow numeric field at the right of a settings CardRow */
  settingsNumberInput: 'w-28',

  /** Wide, height-capped dialog whose body scrolls (forms, JSON editors) */
  dialogScrollable: 'max-w-xl max-h-[85vh] flex flex-col',

  /** Height-capped monospace preview of tool-call arguments */
  argsPreview: `px-3 py-2 text-callout font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto ${RADIUS.md}`,

} as const;

// ─── AUDIO PLAYER TOKENS ──────────────────────────────────────

export const AUDIO = {
  /** Outer player shell (no layout/padding — compose externally) */
  shell: `${SURFACE.subtle} shadow-raised rounded-lg select-none outline-none`,

  /** Player focus ring */
  focusRing: 'focus:ring-2 focus:ring-focus',

  /** Waveform canvas container */
  waveform: 'h-10 w-full rounded-md overflow-hidden',

  /** Transparent control button (skip, volume icon) */
  controlButton: `w-8 h-8 flex items-center justify-center rounded-full ${TEXT.muted} ${SURFACE.hoverSubtle} hover:text-primary transition-all shrink-0`,

  /** Play/pause primary button */
  playButton: 'w-9 h-9 flex items-center justify-center rounded-full bg-inverse text-inverse shrink-0 shadow-raised transition-all',

  /** Speed trigger pill */
  speedTrigger: `h-7 px-2 flex items-center justify-center rounded-md text-subheadline font-mono font-medium ${TEXT.muted} ${SURFACE.hoverSubtle} hover:text-primary transition-all`,

  /** Popover surface (volume slider, speed menu) */
  popover: `${SURFACE.dropdown} shadow-floating`,

  /** Popover menu item base */
  popoverItem: 'block w-full text-left px-3 py-1.5 text-callout font-mono rounded-md transition-colors',

  /** Popover menu item — selected state */
  popoverItemSelected: `${SURFACE.selected} ${TEXT.primary}`,

  /** Popover menu item — default state */
  popoverItemDefault: `${TEXT.muted} ${SURFACE.hoverSubtle}`,

  /** Volume slider track */
  volumeSlider: `${COMPONENT.progressTrack} h-24 w-1.5 appearance-none rounded-full cursor-pointer [writing-mode:vertical-lr] direction-rtl`,

  /** Time label interactive (elapsed/remaining toggle) */
  timeLabelInteractive: `text-callout font-mono tabular-nums min-w-[4.5rem] text-left ${TEXT.muted} hover:text-primary cursor-pointer transition-colors`,

  /** Duration label (right-aligned, not interactive) */
  timeLabelDuration: `text-callout font-mono tabular-nums min-w-[4.5rem] text-right ${TEXT.muted}`,
} as const;
