# Phase 1: Dark Theme Colors & Icon Treatment

## Problem

1. Dark mode backgrounds are too black (`night-950` = `#060608`, `night-900` = `#0c0d12`).
2. Icon in dark mode appears as a flat black square instead of having a macOS-native gradient feel.
3. Light mode icon lacks a clean white background.

## Target Values

| Area | Current | Target |
|------|---------|--------|
| Chat view / idle view (right side) | `#060608` (night-950) | `rgb(18,18,18)` = `#121212` |
| Left sidebar | `#0c0d12` (night-900) | `rgb(20,20,20)` = `#141414` |
| Icon dark mode | Flat black | Gradient: `rgb(50,50,50)` top → `rgb(20,20,20)` bottom, -1px drop shadow top→bottom |
| Icon light mode | (unspecified) | White background |

## Files to Change

### Step 1: Update Tailwind palette

**File:** `tailwind.config.js` (lines 34-49)

The night palette's bottom two stops need adjustment. The rest of the palette should shift proportionally to avoid muddy contrast between adjacent stops.

```
Current:
  night-850: '#12141a'    → Elevated surfaces
  night-900: '#0c0d12'    → Cards, modals, main surfaces
  night-950: '#060608'    → Body bg (deepest)

Target:
  night-850: '#1a1a1a'    → Elevated surfaces (bump up proportionally)
  night-900: '#141414'    → Sidebar, cards, modals (was #0c0d12)
  night-950: '#121212'    → Body bg, chat view (was #060608)
```

Note: The existing palette has a cool blue-ish micro-saturation (`#0c0d12` has slight blue). The requested targets are pure neutral greys. This is an intentional shift from cool-tinted dark to neutral dark. All three stops should be pure grey to stay consistent.

Optionally adjust night-800 (`#181b22` → `#1e1e1e`) and night-750 (`#1f222c` → `#242424`) to maintain smooth ramp. Review these values visually before committing — the goal is a smooth gradient from night-950 (`#121212`) up to night-400 (`#8b92a8`). The mid-range stops (400-700) can stay as-is since they're text/border colors, not background surfaces.

### Step 2: Update CSS variables

**File:** `index.css` (lines 50-81, `.dark` block)

Update every CSS variable that references the old hex values:

```css
.dark {
  --surface-modal: #141414;           /* was #0c0d12 (night-900) */
  --surface-dropdown: #1e1e1e;        /* was #181b22 (night-800) */
  --surface-input: rgba(26,26,26,0.6);/* was rgba(18,20,26,0.6) (night-850) */
  --surface-input-field: #1e1e1e;     /* was #181b22 (night-800) */
  /* night-750 stops stay relative — update if you shift night-750 */
  --switch-thumb: #141414;            /* was #0c0d12 (night-900) */
}
```

### Step 3: Update glass.css

**File:** `src/styles/glass.css` (lines 9-14, 67-71)

```css
/* line 12: */
background: rgba(18,18,18, 0.88) !important;  /* was rgba(6,6,8,0.88) */

/* line 70 (reduced-transparency fallback): */
background: #121212 !important;                /* was #060608 */
```

### Step 4: Update markdown.css hardcoded dark colors

**File:** `src/styles/markdown.css`

Search for any hardcoded references to old night hex values (e.g. `#181b22`, `#12141a`, `#0c0d12`). These must be updated to the new equivalents. Key spots:
- Inline code background (line ~127): `#181b22` → new night-800
- Code block header (line ~256): `#12141a` → new night-850
- Shiki dark bg fallback (line ~271): `#0d1117` → keep as-is (this is Shiki's GitHub dark theme, not our palette)

### Step 5: theme.config.ts — no direct changes needed

The `SURFACE` tokens in `theme.config.ts` reference Tailwind class names like `dark:bg-night-950`, not hex values. Since we're changing the hex values *behind* those class names in `tailwind.config.js`, the tokens stay untouched. Verify this by searching for any hardcoded hex in `theme.config.ts` — there should be none.

### Step 6: Icon treatment

**File:** `components/ProvidersAvatar.tsx` (or wherever the app logo/icon is rendered in the sidebar and title bar)

The app icon needs two treatments:

**Dark mode:**
- Background: CSS gradient `linear-gradient(180deg, rgb(50,50,50) 0%, rgb(20,20,20) 100%)`
- Shadow: `0 -1px 0 rgba(0,0,0,0.3)` (inset top shadow, simulating the macOS icon lighting)
- Border-radius: macOS standard squircle (use `rounded-[22%]` or the existing icon radius)

**Light mode:**
- Background: `#ffffff`
- Optional subtle border: `border border-parchment-300/50` to prevent blending into light backgrounds

Implementation: Add a wrapper `<div>` around the icon `<img>` that applies the gradient background. Use `dark:` prefix for the gradient and light-mode classes for white bg. The gradient and shadow should be on the container, not the icon image itself.

If the icon has transparent regions, the gradient shows through. If the icon is opaque, apply the gradient as a border/frame effect instead.

Search the codebase for where the app icon (not provider icons) is rendered — likely in the sidebar header or tray setup. The tray icon is handled natively by Tauri and is not affected by CSS.

## Verification

1. `npm run tauri:dev` — visually compare sidebar vs main area. Sidebar should be subtly darker.
2. Toggle light/dark mode — no flash of wrong colors, icon treatment swaps correctly.
3. Check glass.css vibrancy on macOS — the semi-transparent tint should still work with the new base color.
4. Check markdown code blocks — no jarring color discontinuity between code block bg and page bg.
