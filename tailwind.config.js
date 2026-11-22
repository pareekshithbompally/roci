/** Maps role names to the CSS variables in src/styles/tokens.css: roles('bg', ['base']) → { base: 'var(--bg-base)' } */
const roles = (prefix, names) => Object.fromEntries(names.map((n) => [n, `var(--${prefix}-${n})`]));
const STATES = ['danger', 'warning', 'success', 'info'];
const stateRoles = (part, suffix = '') =>
  Object.fromEntries(STATES.map((s) => [`${s}${suffix}`, `var(--${s}-${part})`]));

/** One enter/exit timing for every transient surface (scrim, sheets, palette, popovers, tooltips). */
const ENTER = '150ms ease-out';
const EXIT = '120ms ease-in';
/** Fade + short drop on the standalone `translate` property: composes with centring transforms, never rescales text. */
const slide = (offset) => ({
  show: { from: { opacity: '0', translate: `0 ${offset}` }, to: { opacity: '1', translate: '0 0' } },
  hide: { from: { opacity: '1', translate: '0 0' }, to: { opacity: '0', translate: `0 ${offset}` } },
});
const FLOAT_SLIDE = slide('-4px');
const SHEET_SLIDE = slide('-8px');
/** iOS sheet rising from the bottom edge: a full slide on the iOS curve, not the short fade above. */
const RISE = {
  show: { from: { translate: '0 100%' }, to: { translate: '0 0' } },
  hide: { from: { translate: '0 0' }, to: { translate: '0 100%' } },
};
/** The iOS presentation curve and time (sheets rising, screens pushing, the sidebar sliding). */
const IOS_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const IOS_DURATION = '350ms';
const RISE_ENTER = `${IOS_DURATION} ${IOS_EASE}`;
const RISE_EXIT = '250ms ease-in';
/** A drawer sliding in from its edge (kit Drawer): from the left (`start`) or the right (`end`). */
const edgeSlide = (from) => ({
  show: { from: { translate: `${from} 0` }, to: { translate: '0 0' } },
  hide: { from: { translate: '0 0' }, to: { translate: `${from} 0` } },
});
const SLIDE_START = edgeSlide('-100%');
const SLIDE_END = edgeSlide('100%');
const DRAWER_ENTER = '300ms ease-out';
const DRAWER_EXIT = '250ms ease-in';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  /** `hover:` only where a pointer hovers (Mac): a tap on iOS never leaves a hover fill behind. */
  future: { hoverOnlyWhenSupported: true },
  content: [
    './index.html',
    './index.tsx',
    './src/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
    './extensions/**/*.{ts,tsx}',
    './consts/**/*.{ts,tsx}',
    './node_modules/streamdown/dist/**/*.js',
  ],
  theme: {
    extend: {
      // ─── Semantic roles (tokens.css). Alpha lives in the token: no `/NN` modifiers. ───
      backgroundColor: {
        ...roles('bg', ['base', 'deep', 'layer-1', 'layer-2', 'layer-3', 'layer-4', 'inverse', 'accent', 'accent-wash', 'knob',
          'hover', 'pressed', 'control', 'control-hover', 'scrim', 'base-glass', 'deep-glass', 'raised-glass', 'glow-core', 'glow-companion', 'glow-wash',
          'grouped', 'grouped-card']),
        ...stateRoles('bg', '-subtle'),
        ...stateRoles('solid'),
        separator: 'var(--border-muted)',
        ai: 'var(--ai-accent)',
        'ai-wash': 'var(--ai-wash)',
        // A calendar event in its calendar's colour (`--event-tint` on the event; the accent when unknown).
        event: 'color-mix(in srgb, var(--event-tint, var(--bg-accent)) var(--event-fill-mix), transparent)',
        'event-bar': 'var(--event-tint, var(--bg-accent))',
      },
      textColor: {
        ...roles('text', ['primary', 'muted', 'faint', 'accent', 'inverse', 'on-accent']),
        ...stateRoles('fg'),
        ai: 'var(--ai-accent)',
        event: 'color-mix(in srgb, var(--event-tint, var(--bg-accent)) var(--event-text-mix), var(--text-primary))',
        'event-meta': 'color-mix(in srgb, var(--event-tint, var(--bg-accent)) var(--event-meta-mix), var(--text-primary))',
      },
      borderColor: {
        DEFAULT: 'var(--border-muted)',
        ...roles('border', ['muted', 'base', 'strong', 'focus']),
        ...stateRoles('border'),
        accent: 'var(--bg-accent)',
        ai: 'var(--ai-border)',
        'ai-soft': 'var(--ai-edge)',
      },
      divideColor: roles('border', ['muted', 'base', 'strong']),
      ringColor: { focus: 'var(--border-focus)' },
      boxShadow: roles('shadow', ['input', 'raised', 'floating', 'overlay']),
      zIndex: roles('z', ['floating', 'modal', 'popover', 'tooltip', 'splash']),
      // State tints as an image layer, so they shade a surface's fill instead of replacing it.
      backgroundImage: {
        // A badge in its logo's colour (`--badge-tint` on the badge): the neutral pill with the colour mixed in, fading across the label (kit Badge `tint`).
        'badge-tint': 'linear-gradient(90deg, color-mix(in srgb, var(--badge-tint) var(--badge-tint-from), var(--bg-layer-2)), color-mix(in srgb, var(--badge-tint) var(--badge-tint-to), var(--bg-layer-2)))',
        'tint-hover': 'linear-gradient(var(--bg-hover), var(--bg-hover))',
        'tint-pressed': 'linear-gradient(var(--bg-pressed), var(--bg-pressed))',
        // Running-work label: a brighter band sweeps across faint text (Text `shimmer`).
        'text-shimmer': 'linear-gradient(90deg, var(--text-faint) 35%, var(--text-primary) 50%, var(--text-faint) 65%)',
        // AI at work: a copper band sweeping across a row (kit AiPending).
        'ai-sweep': 'var(--ai-sweep)',
        // AI-written result card (Surface `ai`).
        'ai-card': 'var(--ai-card)',
      },
      backgroundSize: { shimmer: '200% 100%' },
      // Grouped-list shape (tokens.css): macOS values by default, iOS under html.platform-ios.
      borderRadius: { card: 'var(--radius-card)', sheet: 'var(--radius-sheet)', field: 'calc(var(--control-md) / 2)' },
      minHeight: { row: 'var(--row-min-h)' },
      // A table cell takes its row's height as a minimum (tables ignore min-height on cells).
      height: { row: 'var(--row-min-h)' },
      transitionTimingFunction: { ios: IOS_EASE },
      transitionDuration: { ios: IOS_DURATION },
      // ─── macOS text styles (SF Pro). `reading` is the one exception: long-form chat/transcript ───
      /** Plain `border` / `divide` lines are one hairline (tokens.css `--hairline`). */
      borderWidth: { DEFAULT: 'var(--hairline)' },
      fontSize: {
        // Sizes come from tokens.css: macOS by default, iOS under html.platform-ios.
        // Each with its line height and letter spacing (Apple's tracking on iOS; none on a Mac).
        subheadline: ['var(--fs-subheadline)', { lineHeight: 'var(--lh-subheadline)', letterSpacing: 'var(--tr-subheadline)' }],
        section: ['var(--fs-section)', { lineHeight: 'var(--lh-section)', fontWeight: 'var(--fw-section)', letterSpacing: 'var(--tr-section)' }],
        timer: ['var(--fs-timer)', { lineHeight: 'var(--lh-timer)', fontWeight: 'var(--fw-timer)' }],
        segment: ['var(--fs-segment)', { lineHeight: 'var(--lh-segment)', letterSpacing: 'var(--tr-segment)' }],
        callout: ['var(--fs-callout)', { lineHeight: 'var(--lh-callout)', letterSpacing: 'var(--tr-callout)' }],
        body: ['var(--fs-body)', { lineHeight: 'var(--lh-body)', letterSpacing: 'var(--tr-body)' }],
        reading: ['var(--fs-reading)', { lineHeight: 'var(--lh-reading)', letterSpacing: 'var(--tr-reading)' }],
        title3: ['var(--fs-title3)', { lineHeight: 'var(--lh-title3)', letterSpacing: 'var(--tr-title3)' }],
        title2: ['var(--fs-title2)', { lineHeight: 'var(--lh-title2)', letterSpacing: 'var(--tr-title2)' }],
        title1: ['var(--fs-title1)', { lineHeight: 'var(--lh-title1)', letterSpacing: 'var(--tr-title1)' }],
        largeTitle: ['var(--fs-large-title)', { lineHeight: 'var(--lh-large-title)', letterSpacing: 'var(--tr-large-title)' }],
        greeting: ['var(--fs-greeting)', { lineHeight: 'var(--lh-greeting)', letterSpacing: 'var(--tr-greeting)' }],
      },
      // 5.5 = a 14px icon + 8px gap (text indented under an icon); 15 = 60px described row
      /** A sheet rises to this share of the screen, its top still showing what it covers (iOS page sheet). */
      maxHeight: { sheet: '92dvh' },
      spacing: { 5.5: '1.375rem', 15: '3.75rem', 'safe-top': 'var(--safe-top)', 'safe-bottom': 'var(--safe-bottom)', 'sheet-end': 'calc(var(--safe-bottom) + 1rem)', 'control-xs': 'var(--control-xs)', 'control-sm': 'var(--control-sm)', 'control-md': 'var(--control-md)', 'control-lg': 'var(--control-lg)', 'welcome-top': '14vh', 'welcome-icon': '4.5rem', 'choice-icon': '4rem', 'row-icon': 'var(--row-icon-gap)', section: 'var(--section-gap)' },
      keyframes: {
        'overlay-show': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'overlay-hide': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
        'content-show': FLOAT_SLIDE.show,
        'content-hide': FLOAT_SLIDE.hide,
        'sheet-show': SHEET_SLIDE.show,
        'sheet-hide': SHEET_SLIDE.hide,
        // A screen pushed onto a sheet's stack (kit NavStack): in from the trailing edge, back out to it.
        'push-in': { from: { translate: '100% 0' }, to: { translate: '0 0' } },
        'push-out': { from: { translate: '0 0' }, to: { translate: '100% 0' } },
        'rise-show': RISE.show,
        'rise-hide': RISE.hide,
        'drawer-start-show': SLIDE_START.show,
        'drawer-start-hide': SLIDE_START.hide,
        'drawer-end-show': SLIDE_END.show,
        'drawer-end-hide': SLIDE_END.hide,
        'text-shimmer': {
          from: { backgroundPosition: '100% 0' },
          to: { backgroundPosition: '-100% 0' },
        },
        // AI output landing: the copper wash fades out of a new or changed line.
        'ai-arrive': { from: { backgroundColor: 'var(--ai-wash)' }, to: { backgroundColor: 'transparent' } },
        // Landing glow blobs; translate(-50%, -50%) makes `left/top` mark each blob's centre.
        'glow-drift-1': {
          '0%, 100%': { transform: 'translate(-50%, -50%) translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(-50%, -50%) translate(3rem, 2rem) scale(1.08)' },
          '66%': { transform: 'translate(-50%, -50%) translate(-2rem, 3rem) scale(0.95)' },
        },
        'glow-drift-2': {
          '0%, 100%': { transform: 'translate(-50%, -50%) translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(-50%, -50%) translate(-4rem, -2rem) scale(1.12)' },
        },
        'glow-drift-3': {
          '0%, 100%': { transform: 'translate(-50%, -50%) translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(-50%, -50%) translate(5rem, -3rem) scale(0.92)' },
        },
      },
      animation: {
        'overlay-show': `overlay-show ${ENTER}`,
        'overlay-hide': `overlay-hide ${EXIT}`,
        // A plain fade with no movement (the scrim's keyframes): content swapping in place, a view mounting.
        'fade-in': `overlay-show ${ENTER}`,
        'content-show': `content-show ${ENTER}`,
        'content-hide': `content-hide ${EXIT}`,
        'sheet-show': `sheet-show ${ENTER}`,
        'sheet-hide': `sheet-hide ${EXIT}`,
        'push-in': `push-in ${IOS_DURATION} ${IOS_EASE}`,
        'push-out': `push-out ${IOS_DURATION} ${IOS_EASE} both`,
        'rise-show': `rise-show ${RISE_ENTER}`,
        'rise-hide': `rise-hide ${RISE_EXIT}`,
        'drawer-start-show': `drawer-start-show ${DRAWER_ENTER}`,
        'drawer-start-hide': `drawer-start-hide ${DRAWER_EXIT}`,
        'drawer-end-show': `drawer-end-show ${DRAWER_ENTER}`,
        'drawer-end-hide': `drawer-end-hide ${DRAWER_EXIT}`,
        'text-shimmer': 'text-shimmer 2s linear infinite',
        'ai-sweep': 'text-shimmer 1.6s linear infinite',
        'ai-arrive': 'ai-arrive 1.8s ease-out',
        'glow-drift-1': 'glow-drift-1 22s ease-in-out infinite',
        'glow-drift-2': 'glow-drift-2 28s ease-in-out infinite',
        'glow-drift-3': 'glow-drift-3 36s ease-in-out infinite',
      },
    },
  },
}
