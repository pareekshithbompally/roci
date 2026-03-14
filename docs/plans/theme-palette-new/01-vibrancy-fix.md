# Phase 1 — Fix Vibrancy: Make the Palette Visible

**Files:** `src/styles/glass.css`, `src/config/theme.config.ts`
**Impact:** Instant — dark mode will show the night palette instead of macOS system gray

---

## Problem

The rendering chain on macOS dark mode:

```
Desktop → macOS vibrancy material → web content (transparent) → user sees vibrancy
```

- `tauri.conf.json` → `"transparent": true` (native window has no background)
- `glass.css` → `background: transparent !important` (CSS removes web background)
- `theme.config.ts` → `SURFACE.page = dark:bg-transparent` (surfaces also transparent)

Result: our night-* palette is invisible. User sees macOS's default dark gray.

## Solution: Tinted Glass

Replace full transparency with high-opacity night colors. The vibrancy shows
through as a subtle undertone (5-15%), but our palette dominates.

```
Desktop → macOS vibrancy material → night-950 at 90% opacity → user sees our palette
```

---

## File 1: `src/styles/glass.css`

### Change 1: Dark mode body (lines 8-14)

**Before:**
```css
html.dark.platform-macos,
html.dark.platform-macos body,
html.dark.platform-macos #root {
  background: transparent !important;
  background-color: transparent !important;
}
```

**After:**
```css
html.dark.platform-macos,
html.dark.platform-macos body,
html.dark.platform-macos #root {
  background: rgba(6, 6, 8, 0.88) !important;      /* night-950 @ 88% */
  background-color: rgba(6, 6, 8, 0.88) !important;
}
```

**Why 88%:** Subtle vibrancy glow visible when moving windows behind the app,
but the night palette is clearly dominant. Tune between 85-92% to taste.

### No change needed for:
- Light mode (lines 17-22) — stays opaque `#fbfaf7`, correct as-is
- Glass shine gradient (lines 29-49) — decorative, fine as-is
- Reduced motion/transparency fallbacks (lines 52-77) — already use solid colors

---

## File 2: `src/config/theme.config.ts`

### Change vibrancy branches from transparent to tinted

Replace `dark:bg-transparent` with high-opacity night colors in the
`SUPPORTS_VIBRANCY` branches. This makes surfaces visible while still
allowing backdrop-blur effects on sub-surfaces.

**SURFACE.page** (line 18):
```ts
// Before:
? 'bg-parchment-100 dark:bg-transparent'
// After:
? 'bg-parchment-100 dark:bg-night-950/90'
```

**SURFACE.sidebar** (line 23):
```ts
// Before:
? 'bg-parchment-150 dark:bg-transparent'
// After:
? 'bg-parchment-150 dark:bg-night-900/85'
```
Sidebar slightly more translucent than page — creates subtle depth separation.

**SURFACE.header** (line 28):
```ts
// Before:
? 'bg-parchment-100 dark:bg-transparent'
// After:
? 'bg-parchment-100 dark:bg-night-950/90'
```

**SURFACE.chatPanel** (line 33):
```ts
// Before:
? 'bg-parchment-100 dark:bg-night-900/70 dark:backdrop-blur-xl'
// After:
? 'bg-parchment-100 dark:bg-night-900/90 dark:backdrop-blur-xl'
```
Bumped from 70% → 90%. Was way too translucent.

**SURFACE.settingsNav** (line 38):
```ts
// Before:
? 'bg-parchment-100 dark:bg-night-900/40 dark:backdrop-blur-xl'
// After:
? 'bg-parchment-100 dark:bg-night-900/85 dark:backdrop-blur-xl'
```
Bumped from 40% → 85%. Was almost invisible before.

**SURFACE.elevated** (line 46):
```ts
// Before:
? 'bg-parchment-50 dark:bg-night-850/80 dark:backdrop-blur-xl'
// After:
? 'bg-parchment-50 dark:bg-night-850/92 dark:backdrop-blur-xl'
```

**LAYOUT.sidebarInnerBg** (line 216):
```ts
// Before:
? 'bg-parchment-150 dark:bg-white/[0.03]'
// After:
? 'bg-parchment-150 dark:bg-night-900/80'
```
`white/[0.03]` was effectively invisible. Now uses night-900 with vibrancy hint.

### Summary of opacity values

| Surface | Old | New | Rationale |
|---------|-----|-----|-----------|
| Body (glass.css) | 0% (transparent) | 88% | Main backdrop, strong |
| Page | 0% (transparent) | 90% | Matches body |
| Header | 0% (transparent) | 90% | Matches body |
| Sidebar | 0% (transparent) | 85% | Slightly more glass than page |
| Sidebar inner | 3% (white) | 80% | Visible container |
| Chat panel | 70% | 90% | Was too see-through |
| Settings nav | 40% | 85% | Was almost invisible |
| Elevated | 80% | 92% | Floating panels, mostly solid |

---

## Verification

After this phase:
1. **Dark mode should look dramatically different** — the night palette is now visible
2. Moving windows behind the app should create a very subtle color shift (vibrancy)
3. The sidebar should appear as a slightly lighter/more translucent panel vs the main area
4. Light mode should look identical (no changes)
5. Non-macOS platforms: no change (they use the `else` branches, already solid)
