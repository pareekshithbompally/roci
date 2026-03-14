# Phase 1: Foundation

**Goal**: Install Radix packages, create the CSS variable bridge between your
existing `theme.config.ts` tokens and Radix's styling hooks, and scaffold the
`src/shared/ui/` directory.

**Risk**: None. Purely additive. No existing code is modified except `index.css`
(adding CSS variables) and `package.json` (adding dependencies).

---

## Step 1.1: Install Dependencies

```bash
npm install \
  @radix-ui/react-dialog \
  @radix-ui/react-alert-dialog \
  @radix-ui/react-select \
  @radix-ui/react-popover \
  @radix-ui/react-dropdown-menu \
  @radix-ui/react-switch \
  @radix-ui/react-tooltip \
  @radix-ui/react-slot \
  cmdk
```

Verify: `npm run build` still succeeds. No breaking changes — these are additive
peer dependencies only.

---

## Step 1.2: CSS Variable Bridge

Add CSS custom properties to `index.css` that map to your existing Tailwind
color values. These variables are consumed by Radix component wrappers for
consistent theming without duplicating your token definitions.

**Why CSS variables?** Radix components need to receive colors as values
(for `style=` props and `data-[state]` selectors). Your current tokens are
Tailwind class strings (`'bg-white dark:bg-zinc-900'`). CSS variables bridge
this gap — they're defined once in `:root` and `.dark`, and read in both
Tailwind `@apply` and direct `var()` references.

**Add to `index.css`** (after the existing `@tailwind` directives, before
existing custom styles):

```css
/* ─── Design System CSS Variables ─────────────────────────── */
/* Bridge between theme.config.ts tokens and Radix UI components.
   These values mirror the Tailwind classes in theme.config.ts.
   Keep in sync when theme tokens change. */

:root {
  /* Surfaces */
  --surface-modal: #ffffff;
  --surface-dropdown: #ffffff;
  --surface-overlay: rgba(0, 0, 0, 0.6);
  --surface-input: rgba(250, 250, 249, 0.8);
  --surface-input-field: #ffffff;
  --surface-selected: #f4f4f5;
  --surface-hover-subtle: rgba(244, 244, 245, 0.8);

  /* Borders */
  --border-default: rgba(228, 228, 231, 0.7);
  --border-strong: #e4e4e7;
  --border-input: #e4e4e7;
  --border-ring: rgba(212, 212, 216, 0.5);

  /* Text */
  --text-primary: #18181b;
  --text-secondary: #52525b;
  --text-muted: #71717a;
  --text-faint: #a1a1aa;

  /* Shadows */
  --shadow-float: 0 10px 15px -3px rgba(0, 0, 0, 0.1),
                  0 4px 6px -4px rgba(0, 0, 0, 0.1);
  --shadow-modal: 0 25px 50px -12px rgba(0, 0, 0, 0.25);

  /* Radius */
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;

  /* Switch (Toggle) */
  --switch-active: #22c55e;
  --switch-inactive: #d4d4d8;
  --switch-thumb: #ffffff;
}

.dark {
  /* Surfaces */
  --surface-modal: #18181b;
  --surface-dropdown: #27272a;
  --surface-overlay: rgba(0, 0, 0, 0.6);
  --surface-input: rgba(24, 24, 27, 0.5);
  --surface-input-field: #27272a;
  --surface-selected: rgba(39, 39, 42, 0.8);
  --surface-hover-subtle: rgba(39, 39, 42, 0.8);

  /* Borders */
  --border-default: #27272a;
  --border-strong: #3f3f46;
  --border-input: #3f3f46;
  --border-ring: #3f3f46;

  /* Text */
  --text-primary: #f4f4f5;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  --text-faint: #71717a;

  /* Shadows */
  --shadow-float: 0 10px 15px -3px rgba(0, 0, 0, 0.3),
                  0 4px 6px -4px rgba(0, 0, 0, 0.3);
  --shadow-modal: 0 25px 50px -12px rgba(0, 0, 0, 0.5);

  /* Switch (Toggle) */
  --switch-active: #16a34a;
  --switch-inactive: #3f3f46;
  --switch-thumb: #18181b;
}
```

**Color value mapping** (for reference — shows the exact Tailwind colors):

| CSS Variable | Light Value | Dark Value | Maps to Token |
|---|---|---|---|
| `--surface-modal` | `white` (#fff) | `zinc-900` (#18181b) | `SURFACE.modal` |
| `--surface-dropdown` | `white` (#fff) | `zinc-800` (#27272a) | `SURFACE.dropdown` |
| `--surface-overlay` | `black/60` | `black/60` | `SURFACE.overlay` |
| `--border-default` | `zinc-200/70` | `zinc-800` | `BORDER.default` |
| `--border-strong` | `zinc-200` | `zinc-700` | `BORDER.strong` |
| `--text-primary` | `zinc-900` | `zinc-100` | `TEXT.primary` |
| `--text-secondary` | `zinc-600` | `zinc-400` | `TEXT.secondary` |
| `--switch-active` | `green-500` | `green-600` | `COMPONENT.toggleActive` |

---

## Step 1.3: Scaffold the UI Directory

Create the directory and barrel file:

```
src/shared/ui/
  index.ts
```

`index.ts` starts empty — each Phase 2 primitive adds its export here:

```ts
// src/shared/ui/index.ts
// Radix UI primitive wrappers — styled with project design tokens.
// Add exports as primitives are built in Phase 2.
```

---

## Step 1.4: Update Path Aliases (if needed)

The existing Vite aliases already cover `@shared` → `./src/shared`, so imports
like `import { Dialog } from '@shared/ui'` will work automatically. No config
changes needed.

Verify by checking `vite.config.ts`:
```ts
'@shared': path.resolve(__dirname, './src/shared'),
```

Also verify `tsconfig.json` has a matching path if using TypeScript path
resolution:
```json
"paths": {
  "@shared/*": ["./src/shared/*"]
}
```

---

## Step 1.5: Add Radix Animation Utilities

Add Tailwind utilities for Radix `data-[state]` attributes. These map your
existing keyframes to Radix's open/closed states.

**Add to `tailwind.config.js`** — extend the theme:

```js
export default {
  darkMode: 'class',
  content: [/* existing paths */],
  theme: {
    extend: {
      keyframes: {
        // These may already exist in index.css — keep both.
        // Tailwind needs them here for the `animate-*` utilities.
        'overlay-show': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'overlay-hide': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
        'content-show': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'content-hide': {
          from: { opacity: '1', transform: 'scale(1)' },
          to: { opacity: '0', transform: 'scale(0.96)' },
        },
        'select-content-show': {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'select-content-hide': {
          from: { opacity: '1', transform: 'translateY(0)' },
          to: { opacity: '0', transform: 'translateY(-4px)' },
        },
      },
      animation: {
        'overlay-show': 'overlay-show 200ms ease-out',
        'overlay-hide': 'overlay-hide 150ms ease-in',
        'content-show': 'content-show 200ms ease-out',
        'content-hide': 'content-hide 150ms ease-in',
        'select-content-show': 'select-content-show 150ms ease-out',
        'select-content-hide': 'select-content-hide 150ms ease-in',
      },
    },
  },
}
```

These will be applied via Tailwind's `data-[state=open]:animate-content-show`
pattern on Radix components.

---

## Verification

- [ ] `npm install` completes without errors
- [ ] `npm run build` succeeds
- [ ] `npm run dev` — app works identically to before
- [ ] CSS variables are visible in DevTools (`:root` and `.dark`)
- [ ] `src/shared/ui/index.ts` exists and is importable
- [ ] No existing component behavior has changed
