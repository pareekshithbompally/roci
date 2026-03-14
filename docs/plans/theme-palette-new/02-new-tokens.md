# Phase 2 — Add Missing Tokens to `theme.config.ts`

**File:** `src/config/theme.config.ts`
**Prerequisite for Phase 3** — components need these tokens to exist before importing them

---

## Why New Tokens?

Phase 3 replaces hardcoded color classes with token imports. But some common patterns
in the codebase don't have matching tokens yet. These appear 3-6+ times each:

| Pattern | Occurrences | Current Token | Status |
|---------|-------------|---------------|--------|
| Tooltip background | 3+ | none | **NEEDS TOKEN** |
| Horizontal divider (bg-based) | 5+ | none | **NEEDS TOKEN** |
| Active tab indicator | 4+ | none | **NEEDS TOKEN** |
| Default tab state | 4+ | none | **NEEDS TOKEN** |
| Inline edit input | 6+ | none | **NEEDS TOKEN** |
| List item row (clickable) | 4+ | none | **NEEDS TOKEN** |
| Skeleton loading | 2+ | none | **NEEDS TOKEN** |
| Inset/recessed surface | 2+ | none | **NEEDS TOKEN** |

---

## New Tokens to Add

### SURFACE additions

Add these after `successCallout` (line 92) in the SURFACE object:

```ts
  /** Tooltip / popover hint background (inverted: dark bg in light mode) */
  tooltip: 'bg-parchment-950 dark:bg-night-750 text-parchment-50 dark:text-night-200 shadow-lg rounded-md',

  /** Horizontal divider line (use with h-px or w-px) */
  divider: 'bg-parchment-300 dark:bg-night-700',

  /** Skeleton loading placeholder */
  skeleton: 'bg-parchment-200 dark:bg-night-800/50 animate-pulse',

  /** Inset / recessed container (tool groups, button groups) */
  inset: 'bg-parchment-200 dark:bg-night-800/60',
```

### COMPONENT additions

Add these after `kbdBadge` (line 363) in the COMPONENT object:

```ts
  /** Active tab indicator (border-b-2 + text) */
  tabActive: `border-parchment-900 dark:border-night-100 ${TEXT.heading}`,

  /** Default/inactive tab state */
  tabDefault: `border-transparent ${TEXT.muted} hover:text-parchment-800 dark:hover:text-night-300`,

  /** Inline edit input (notes, todos, history rename) */
  inlineInput: `${SURFACE.inputField} border ${BORDER.input} ${RADIUS.md} text-sm ${TEXT.primary} outline-none ${BORDER.inputFocus} resize-none`,

  /** Clickable list row (suggestions, sources, history items) */
  listRow: `flex items-center gap-2 text-left w-full px-3 py-2 text-sm ${TEXT.secondary} hover:text-parchment-900 dark:hover:text-night-200 ${SURFACE.hoverSubtle} rounded-lg transition-colors cursor-pointer`,
```

---

## Total: 8 new tokens (4 SURFACE + 4 COMPONENT)

These cover the most common hardcoded patterns in the 40 files.
One-off patterns (1-2 usages) will use compositions of existing tokens
in Phase 3 rather than getting dedicated tokens.

---

## Token Catalog (Complete — for Phase 3 reference)

### SURFACE tokens (22 total, 4 new)
| Token | Light | Dark | Use for |
|-------|-------|------|---------|
| `.page` | parchment-100 | night-950 | Page background |
| `.sidebar` | parchment-150 | night-900 | Sidebar background |
| `.header` | parchment-100 | night-950 | Header bar |
| `.chatPanel` | parchment-100 | night-900 | Chat panel |
| `.settingsNav` | parchment-100 | night-900 | Settings nav |
| `.modal` | parchment-50 | night-900 | Modal/dialog |
| `.elevated` | parchment-50 | night-850 | Floating panels |
| `.input` | parchment-150/80 | night-850/60 | Input containers |
| `.dropdown` | parchment-50 | night-800 | Dropdown menus |
| `.overlay` | black/60 | black/60 | Full-screen backdrop |
| `.hoverSubtle` | parchment-200/80 | night-750/80 | List item hover |
| `.selected` | parchment-200 | night-750/80 | Selected item |
| `.inputField` | parchment-50 | night-800 | Form input fields |
| `.selectedCard` | parchment-200 | night-800 | Selected card |
| `.card` | parchment-50 | night-900 | Card surface |
| `.chip` | parchment-200 | night-800 | Tag/chip bg |
| `.subtle` | parchment-150 | night-900/50 | Subtle bg |
| `.{info,match,error,warning,success}Callout` | semantic | semantic | Callout variants |
| **`.tooltip`** | parchment-950 | night-750 | **NEW: tooltip bg** |
| **`.divider`** | parchment-300 | night-700 | **NEW: hr/divider** |
| **`.skeleton`** | parchment-200 | night-800/50 | **NEW: loading** |
| **`.inset`** | parchment-200 | night-800/60 | **NEW: recessed** |

### COMPONENT tokens (28 total, 4 new)
| Token | Use for |
|-------|---------|
| `.iconButton` | Header/toolbar icon button (p-2, muted, hover) |
| `.iconButtonSm` | Small icon button (p-1.5, faint, hover) |
| `.sendButtonActive` | Active send button |
| `.sendButtonDisabled` | Disabled send button |
| `.stopButton` | Stop/cancel (red) |
| `.settingsNavSelected` | Selected settings nav item |
| `.settingsNavDefault` | Default settings nav item |
| `.sidebarItemSelected` | Selected sidebar item |
| `.sidebarItemDefault` | Default sidebar item |
| `.chipButton` | Chip/pill button |
| `.suggestionButton` | Suggestion card |
| `.floatingButton` | Scroll-to-bottom |
| `.toggleActive/Inactive` | Toggle switch |
| `.dropdownItemHover` | Dropdown item hover |
| `.dropdownItem` | Dropdown item |
| `.toolbarButton` | Toolbar circle button |
| `.toolbarButtonActive` | Active toolbar button (blue) |
| `.primaryButton` | Primary CTA |
| `.secondaryButton` | Secondary button |
| `.dangerButton` | Danger/delete button |
| `.successButton` | Success/confirm button |
| `.accentButton` | Blue accent CTA |
| `.destructiveHover` | Delete icon hover |
| `.kbdBadge` | Keyboard shortcut badge |
| **`.tabActive`** | **NEW: active tab** |
| **`.tabDefault`** | **NEW: inactive tab** |
| **`.inlineInput`** | **NEW: inline edit field** |
| **`.listRow`** | **NEW: clickable list row** |

---

## Verification

After this phase:
1. Build passes (no references to the new tokens yet, just definitions)
2. The new tokens use existing sub-tokens (TEXT, SURFACE, BORDER) so they
   automatically use the parchment/night palette
3. Phase 3 can now import and use these tokens
