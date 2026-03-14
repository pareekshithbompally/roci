# Component Migration Plan: Radix UI Primitives

## Goal

Replace all hand-rolled modals, dropdowns, selects, popovers, and overlays with
Radix UI primitives. Establish a standard `src/shared/ui/` component library that
the entire app consumes. No visual regressions. No changes to app shape or
behavior. Chat UI, streaming, markdown rendering, recording widget, and download
banner remain untouched.

---

## Principles

1. **Incremental, file-at-a-time migration** — every phase produces a working app.
   No big-bang rewrites. Each step can be merged independently.

2. **Thin wrappers over Radix** — each `src/shared/ui/` component is a small file
   that imports a Radix primitive and applies your existing theme tokens. No new
   design system. No new color palette. The visual output is identical.

3. **Token bridge, not token replacement** — your `theme.config.ts` tokens
   (SURFACE, BORDER, TEXT, COMPONENT, etc.) stay as the single source of truth.
   We add a thin CSS variable layer that Radix components read, mapped 1:1 from
   your existing tokens. No duplication.

4. **Do not touch the chat pipeline** — `ChatView`, `ChatPanel`, `ChatMessage`,
   `ChatInput`, `Streamdown`, `streamingStore`, `markdown.css`, the streaming
   buffer drain, `use-stick-to-bottom` — none of this changes. These are complex,
   performance-critical, and working well.

5. **Do not touch custom widgets** — `RecordingWidget` (minimized bar),
   `DownloadBanner`, `CustomAudioPlayer`, `QualityPresetSelector`,
   `react-resizable-panels` layout, `sonner` toasts — all stay as-is. They are
   domain-specific, not generic UI primitives.

6. **Accessibility for free** — Radix gives you ARIA roles, keyboard nav, focus
   trapping, screen reader announcements. We delete our manual `useEffect` +
   `addEventListener('mousedown')` + `addEventListener('keydown')` patterns.

7. **Animation continuity** — existing `animate-fade-in` and
   `animate-dropdown-in` keyframes are preserved and applied to Radix's
   `data-[state=open]` / `data-[state=closed]` attributes.

---

## Phase Summary

| Phase | Deliverable | Files Touched | Risk |
|-------|-------------|---------------|------|
| [Phase 1](./01-foundation.md) | Install Radix packages, CSS variable bridge, `src/shared/ui/` scaffold | package.json, index.css, new directory | None — additive only |
| [Phase 2](./02-primitives.md) | Build 7 shared UI wrappers (Dialog, AlertDialog, Select, Popover, Command, DropdownMenu, Switch) | New files in `src/shared/ui/` | None — no consumers yet |
| [Phase 3](./03-settings-migration.md) | Migrate settings panels: native `<select>` → `Select`, custom `Toggle` → `Switch` | AudioPanel, LocalInferencePanel, ProvidersPanel, Toggle | Low — isolated settings UI |
| [Phase 4](./04-modal-migration.md) | Migrate modals: UnsavedChanges, ModelDownload, DeleteConfirm, RecordingView | 4 modal files | Medium — modals are global |
| [Phase 5](./05-dropdown-picker-migration.md) | Migrate dropdowns: ModelPicker, MeetingMentionPopup, ProvidersPanel search | 3 component files | Medium — chat-adjacent |
| [Phase 6](./06-search-overlay.md) | Migrate SearchOverlay → Command (cmdk) palette | SearchOverlay.tsx | Low — self-contained |

See [Do Not Touch](./07-do-not-touch.md) for the full exclusion list.

---

## Dependency Graph

```
Phase 1 (foundation)
  └── Phase 2 (primitives)
        ├── Phase 3 (settings) — can run independently
        ├── Phase 4 (modals) — can run independently
        ├── Phase 5 (dropdowns) — can run independently
        └── Phase 6 (search) — can run independently
```

Phases 3–6 are independent of each other after Phase 2 is complete.
Execute them in any order. The recommended order (3 → 4 → 5 → 6) goes from
lowest to highest complexity.

---

## Packages to Install

```
@radix-ui/react-dialog          — Dialog, Sheet
@radix-ui/react-alert-dialog    — AlertDialog (confirmations)
@radix-ui/react-select           — Select (dropdowns)
@radix-ui/react-popover          — Popover (floating panels)
@radix-ui/react-dropdown-menu    — DropdownMenu (context menus)
@radix-ui/react-switch           — Switch (toggle)
@radix-ui/react-tooltip          — Tooltip (future use)
@radix-ui/react-slot             — Slot (composition helper)
cmdk                             — Command palette (search overlay)
```

All are tree-shakeable. Only the packages actually imported will ship in
the bundle. Total addition: ~40-60KB uncompressed (much less gzipped),
offset by deleting manual event handling code.

---

## Directory Structure (after migration)

```
src/shared/ui/
  index.ts                  — barrel export
  dialog.tsx                — Dialog + DialogContent + DialogHeader + ...
  alert-dialog.tsx          — AlertDialog wrappers
  select.tsx                — Select + SelectTrigger + SelectContent + ...
  popover.tsx               — Popover wrappers
  dropdown-menu.tsx         — DropdownMenu wrappers
  switch.tsx                — Switch (replaces Toggle)
  command.tsx               — Command palette (cmdk wrapper)
  tooltip.tsx               — Tooltip (optional, future)
```

Each file is a standalone module with named exports. The barrel `index.ts`
re-exports everything for convenience:
```ts
export * from './dialog';
export * from './select';
// etc.
```

---

## Validation Checklist (per phase)

- [ ] `npm run build` succeeds with no TypeScript errors
- [ ] `npm run dev` — app launches, no console errors
- [ ] Dark mode toggle works, all migrated components theme correctly
- [ ] macOS vibrancy/blur still works on applicable surfaces
- [ ] Keyboard navigation works (Tab, Escape, Arrow keys, Enter)
- [ ] Click-outside dismissal works on all modals/dropdowns
- [ ] Focus trapping works in modals (Tab doesn't escape)
- [ ] Animations play (fade-in, scale-in) — no jank
- [ ] No visual regressions in unmigrated components
- [ ] Chat streaming still works flawlessly (not touched, but verify)
