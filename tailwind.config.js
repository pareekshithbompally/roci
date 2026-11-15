/** Maps role names to the CSS variables in src/styles/tokens.css: roles('bg', ['base']) → { base: 'var(--bg-base)' } */
const roles = (prefix, names) => Object.fromEntries(names.map((n) => [n, `var(--${prefix}-${n})`]));
const STATES = ['danger', 'warning', 'success', 'info'];
const stateRoles = (part, suffix = '') =>
  Object.fromEntries(STATES.map((s) => [`${s}${suffix}`, `var(--${s}-${part})`]));

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
        ...roles('bg', ['base', 'deep', 'layer-1', 'layer-2', 'layer-3', 'layer-4', 'inverse', 'accent', 'knob',
          'hover', 'pressed', 'scrim', 'base-glass', 'deep-glass', 'raised-glass', 'glow-core', 'glow-companion', 'glow-wash']),
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
      // State tints as an image layer, so they shade a surface's fill instead of replacing it.
      backgroundImage: {
        'tint-hover': 'linear-gradient(var(--bg-hover), var(--bg-hover))',
        'tint-pressed': 'linear-gradient(var(--bg-pressed), var(--bg-pressed))',
      },
      // ─── macOS text styles (SF Pro). `reading` is the one exception: long-form chat/transcript ───
      fontSize: {
        subheadline: ['11px', '14px'],
        callout: ['12px', '16px'],
        body: ['13px', '16px'],
        reading: ['14px', '22px'],
        title3: ['15px', '20px'],
        title2: ['17px', '22px'],
        title1: ['22px', '26px'],
        largeTitle: ['26px', '32px'],
      },
      // 5.5 = a 14px icon + 8px gap (text indented under an icon); 15 = 60px described row
      spacing: { 5.5: '1.375rem', 15: '3.75rem' },
      keyframes: {
        'overlay-show': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'overlay-hide': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
        'content-show': {
          from: { opacity: '0', scale: '0.96' },
          to: { opacity: '1', scale: '1' },
        },
        'content-hide': {
          from: { opacity: '1', scale: '1' },
          to: { opacity: '0', scale: '0.96' },
        },
        'select-content-show': {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'select-content-hide': {
          from: { opacity: '1', transform: 'translateY(0)' },
          to: { opacity: '0', transform: 'translateY(-4px)' },
        },
        // Both frames carry translateX(-50%): a keyframed transform overrides the palette's -translate-x-1/2.
        'palette-show': {
          from: { opacity: '0', transform: 'translate(-50%, -8px)' },
          to: { opacity: '1', transform: 'translate(-50%, 0)' },
        },
        'palette-hide': {
          from: { opacity: '1', transform: 'translate(-50%, 0)' },
          to: { opacity: '0', transform: 'translate(-50%, -4px)' },
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
        'overlay-show': 'overlay-show 200ms ease-out',
        'overlay-hide': 'overlay-hide 150ms ease-in',
        'content-show': 'content-show 200ms ease-out',
        'content-hide': 'content-hide 150ms ease-in',
        'select-content-show': 'select-content-show 150ms ease-out',
        'select-content-hide': 'select-content-hide 150ms ease-in',
        'palette-show': 'palette-show 150ms ease-out',
        'palette-hide': 'palette-hide 120ms ease-in',
        'placeholder-fade-in': 'placeholder-fade-in 600ms ease-out',
        'glow-drift-1': 'glow-drift-1 22s ease-in-out infinite',
        'glow-drift-2': 'glow-drift-2 28s ease-in-out infinite',
        'glow-drift-3': 'glow-drift-3 36s ease-in-out infinite',
      },
    },
  },
}
