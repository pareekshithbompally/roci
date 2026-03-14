# Theme Palette Overhaul v2 — Revised Plan

## What Changed From v1

The v1 plan (Phases 1-4) replaced zinc class names with parchment/night class names.
That was wrong for two reasons:

1. **macOS vibrancy makes the palette invisible.** `glass.css` forces `transparent !important`
   on the body, and `theme.config.ts` sets main surfaces to `dark:bg-transparent`.
   The native macOS vibrancy material is what the user actually sees — not our colors.

2. **Swapping zinc→parchment/night in components is the same problem with different names.**
   If we hardcode `bg-night-800` in 40 files instead of `bg-zinc-800`, we'll be doing
   this migration again whenever the palette changes. The fix is to use TOKENS, not
   direct color classes.

## Current State (Post v1 Phases 1-3 + partial Phase 4)

- `tailwind.config.js` — parchment + night scales defined ✅
- `index.css` — CSS variables updated to new palette ✅
- `theme.config.ts` — all tokens use parchment/night ✅
- `src/styles/markdown.css` — hex values updated ✅
- `src/styles/glass.css` — partially updated (dark fallback) ✅
- `src/styles/syntax-highlight.css` — bg updated ✅
- **9 component files** — have hardcoded parchment/night classes (should be tokens)
- **31 component files** — still have hardcoded zinc classes

**Total: 40 files with hardcoded color classes that should be token imports.**

## Revised Plan: 3 Phases

### Phase 1 — Fix Vibrancy (2 files)
Make the palette actually visible on macOS. Change `transparent` to tinted glass
(night-950 at ~90% opacity). Small, targeted, instant visual impact.

### Phase 2 — Add Missing Tokens (1 file)
Add ~8 new tokens to `theme.config.ts` for patterns not currently covered:
tooltip, divider, tab indicator, inline input, list row.

### Phase 3 — Tokenify All Components (40 files)
Replace every hardcoded color class (zinc, parchment, night) with token imports.
After this phase, components have ZERO direct color references — only tokens.
Future palette changes become a 1-file edit.

## Files Per Phase

| Phase | Files | Changes |
|-------|-------|---------|
| 1 | `glass.css`, `theme.config.ts` | ~10 lines |
| 2 | `theme.config.ts` | ~20 lines (new tokens) |
| 3 | 40 component files | ~200 class replacements |

## Design Principle

**Components should never contain color class names.** They should only reference
tokens from `theme.config.ts`. The token file is the single source of truth for
all visual styling. CSS files (`markdown.css`, `index.css`) are the exception since
they can't import TS — those use hex values that match the palette.
