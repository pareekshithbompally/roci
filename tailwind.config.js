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
      colors: {
        // ─── Light mode: neutral system grays (macOS-like) ───
        paper: {
          50:  '#ffffff',   // Cards, modals
          100: '#f5f5f7',   // Page background
          150: '#ececf0',   // Sidebar, subtle input bg
          200: '#e5e5ea',   // Selected, hover, chips
          300: '#d1d1d6',   // Default borders
          400: '#c7c7cc',   // Strong borders, input borders
          500: '#aeaeb2',   // Scrollbar, faint borders
          600: '#8e8e93',   // Faint text
          700: '#636366',   // Muted text
          800: '#48484a',   // Secondary text
          900: '#1c1c1e',   // Primary text
          950: '#000000',   // Headings, darkest
        },
        // ─── Dark mode: pure grayscale ───
        night: {
          50:  '#f5f5f5',   // Headings, brightest
          100: '#ededed',   // Primary text
          150: '#e0e0e0',   // (rarely used)
          200: '#d4d4d4',   // Markdown body text
          300: '#bbbbbb',   // (rarely used)
          400: '#999999',   // Secondary text
          500: '#666666',   // Muted text, placeholders
          600: '#444444',   // Scrollbar thumb
          650: '#333333',   // Strong borders, focus rings
          700: '#2a2a2a',   // Default borders
          750: '#222222',   // Selected/hover states
          800: '#1c1c1c',   // Dropdowns, input fields, user chat bubble
          850: '#181818',   // Elevated surfaces, cards, modals
          900: '#151515',   // Page bg, idle/chat view
          950: '#121212',   // Sidebar (deepest)
        },
      },
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
        'placeholder-fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        'overlay-show': 'overlay-show 200ms ease-out',
        'overlay-hide': 'overlay-hide 150ms ease-in',
        'content-show': 'content-show 200ms ease-out',
        'content-hide': 'content-hide 150ms ease-in',
        'select-content-show': 'select-content-show 150ms ease-out',
        'select-content-hide': 'select-content-hide 150ms ease-in',
        'placeholder-fade-in': 'placeholder-fade-in 600ms ease-out',
      },
    },
  },
}
