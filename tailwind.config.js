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

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
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
          'hover', 'pressed', 'control', 'control-hover', 'scrim', 'base-glass', 'deep-glass', 'raised-glass', 'glow-core', 'glow-companion', 'glow-wash']),
        ...stateRoles('bg', '-subtle'),
        ...stateRoles('solid'),
        separator: 'var(--border-muted)',
        ai: 'var(--ai-accent)',
      },
      textColor: {
        ...roles('text', ['primary', 'muted', 'faint', 'accent', 'inverse', 'on-accent']),
        ...stateRoles('fg'),
        ai: 'var(--ai-accent)',
      },
      borderColor: {
        DEFAULT: 'var(--border-muted)',
        ...roles('border', ['muted', 'base', 'strong', 'focus']),
        ...stateRoles('border'),
        accent: 'var(--bg-accent)',
      },
      divideColor: roles('border', ['muted', 'base', 'strong']),
      ringColor: { focus: 'var(--border-focus)' },
      boxShadow: roles('shadow', ['input', 'raised', 'floating', 'overlay']),
      zIndex: roles('z', ['floating', 'modal', 'popover', 'tooltip', 'splash']),
      // State tints as an image layer, so they shade a surface's fill instead of replacing it.
      backgroundImage: {
        'tint-hover': 'linear-gradient(var(--bg-hover), var(--bg-hover))',
        'tint-pressed': 'linear-gradient(var(--bg-pressed), var(--bg-pressed))',
        // Running-work label: a brighter band sweeps across faint text (Text `shimmer`).
        'text-shimmer': 'linear-gradient(90deg, var(--text-faint) 35%, var(--text-primary) 50%, var(--text-faint) 65%)',
      },
      backgroundSize: { shimmer: '200% 100%' },
      // ─── macOS text styles (SF Pro). `reading` is the one exception: long-form chat/transcript ───
      fontSize: {
        // Sizes come from tokens.css: macOS by default, iOS under html.platform-ios.
        subheadline: ['var(--fs-subheadline)', 'var(--lh-subheadline)'],
        callout: ['var(--fs-callout)', 'var(--lh-callout)'],
        body: ['var(--fs-body)', 'var(--lh-body)'],
        reading: ['var(--fs-reading)', 'var(--lh-reading)'],
        title3: ['var(--fs-title3)', 'var(--lh-title3)'],
        title2: ['var(--fs-title2)', 'var(--lh-title2)'],
        title1: ['var(--fs-title1)', 'var(--lh-title1)'],
        largeTitle: ['var(--fs-large-title)', 'var(--lh-large-title)'],
      },
      // 5.5 = a 14px icon + 8px gap (text indented under an icon); 15 = 60px described row
      spacing: { 5.5: '1.375rem', 15: '3.75rem', 'safe-top': 'var(--safe-top)', 'safe-bottom': 'var(--safe-bottom)', 'control-xs': 'var(--control-xs)', 'control-sm': 'var(--control-sm)', 'control-md': 'var(--control-md)' },
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
        'text-shimmer': {
          from: { backgroundPosition: '100% 0' },
          to: { backgroundPosition: '-100% 0' },
        },
        'placeholder-fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
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
        'placeholder-fade-in': 'placeholder-fade-in 600ms ease-out',
        'text-shimmer': 'text-shimmer 2s linear infinite',
        'glow-drift-1': 'glow-drift-1 22s ease-in-out infinite',
        'glow-drift-2': 'glow-drift-2 28s ease-in-out infinite',
        'glow-drift-3': 'glow-drift-3 36s ease-in-out infinite',
      },
    },
  },
}
