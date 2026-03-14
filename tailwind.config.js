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
  ],
  theme: {
    extend: {
      colors: {
        // ─── Light mode: warm parchment ───
        parchment: {
          50:  '#ffffff',   // Cards, modals
          100: '#fbfaf7',   // Page background
          150: '#f7f5ef',   // Sidebar, subtle input bg
          200: '#f0ede5',   // Selected, hover, chips
          300: '#e4e0d6',   // Default borders
          400: '#d5d0c4',   // Strong borders, input borders
          500: '#b0a99c',   // Scrollbar, faint borders
          600: '#8a847a',   // Faint text
          700: '#6b655c',   // Muted text
          800: '#4a453e',   // Secondary text
          900: '#1e1c18',   // Primary text
          950: '#0e0d0b',   // Headings, darkest
        },
        // ─── Dark mode: neutral grey ───
        night: {
          50:  '#f2f4fc',   // Headings, brightest
          100: '#e6e9f4',   // Primary text
          200: '#d0d5e4',   // Markdown body text
          300: '#b0b6cc',   // (rarely used)
          400: '#8b92a8',   // Secondary text
          500: '#5c6278',   // Muted text, placeholders
          600: '#3e4354',   // Scrollbar thumb
          650: '#303440',   // Strong borders, focus rings
          700: '#272a36',   // Default borders
          750: '#242424',   // Selected/hover states
          800: '#1e1e1e',   // Dropdowns, input fields
          850: '#1a1a1a',   // Elevated surfaces
          900: '#141414',   // Cards, modals, main surfaces
          950: '#121212',   // Body bg (deepest)
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
