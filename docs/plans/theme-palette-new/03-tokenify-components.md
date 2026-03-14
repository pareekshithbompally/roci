# Phase 3 — Tokenify All Components

**Files:** 40 component files
**Goal:** Zero hardcoded color classes in components. Only token imports.

---

## How to Use This Plan

For each file:
1. Add/verify the import: `import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config'`
   (only import the token groups you actually use)
2. Use the **Mapping Table** below to replace each hardcoded class pattern
3. For complex className strings, replace only the COLOR portion — keep layout
   classes (flex, p-2, w-full, text-sm, etc.) as-is

---

## Universal Mapping Table

Use this to translate any hardcoded color class → token reference.

### Text Colors → TEXT tokens

| Hardcoded Pattern | Token | Notes |
|---|---|---|
| `text-zinc-900 dark:text-zinc-100` | `TEXT.primary` | |
| `text-parchment-900 dark:text-night-100` | `TEXT.primary` | Phase 4 leftover |
| `text-zinc-800 dark:text-zinc-200` | `TEXT.primary` | |
| `text-zinc-900 dark:text-white` | `TEXT.heading` | |
| `text-parchment-900 dark:text-night-50` | `TEXT.heading` | Phase 4 leftover |
| `text-zinc-700 dark:text-zinc-300` | `TEXT.secondary` | |
| `text-parchment-800 dark:text-night-300` | `TEXT.secondary` | Phase 4 leftover |
| `text-zinc-600 dark:text-zinc-400` | `TEXT.secondary` | |
| `text-zinc-500 dark:text-zinc-400` | `TEXT.muted` | |
| `text-parchment-700 dark:text-night-400` | `TEXT.muted` | Phase 4 leftover |
| `text-zinc-400 dark:text-zinc-500` | `TEXT.faint` | |
| `text-parchment-600 dark:text-night-500` | `TEXT.faint` | Phase 4 leftover |
| `text-zinc-400` (standalone, no dark:) | `TEXT.faint` | incomplete pattern |
| `text-parchment-600` (standalone) | `TEXT.faint` | Phase 4 leftover |
| `text-zinc-500` (standalone, no dark:) | `TEXT.muted` | incomplete pattern |
| `text-parchment-700` (standalone) | `TEXT.muted` | Phase 4 leftover |

### Surface Colors → SURFACE tokens

| Hardcoded Pattern | Token |
|---|---|
| `bg-white dark:bg-zinc-900` | `SURFACE.card` |
| `bg-parchment-50 dark:bg-night-900` | `SURFACE.card` |
| `bg-white dark:bg-zinc-950` | `SURFACE.page` (non-vibrancy) |
| `bg-zinc-100 dark:bg-zinc-800` | `SURFACE.selectedCard` |
| `bg-parchment-200 dark:bg-night-800` | `SURFACE.selectedCard` |
| `bg-zinc-50 dark:bg-zinc-800` | `SURFACE.inputField` |
| `bg-zinc-100 dark:bg-zinc-800/60` | `SURFACE.inset` (new) |
| `bg-zinc-100 dark:bg-zinc-800/70` | `SURFACE.inputField` |
| `bg-zinc-200 dark:bg-zinc-800` | `SURFACE.chip` |
| `bg-zinc-50/50 dark:bg-zinc-900/30` | `SURFACE.subtle` |
| `bg-zinc-100 dark:bg-zinc-800/50` | `SURFACE.skeleton` (new) |
| `bg-zinc-200 dark:bg-zinc-800` (h-px divider) | `SURFACE.divider` (new) |
| `bg-zinc-200 dark:bg-zinc-700` (h-px divider) | `SURFACE.divider` (new) |
| `bg-zinc-900 dark:bg-zinc-100` (indicator dot) | use `COMPONENT.primaryButton` colors or `${TEXT.heading}` bg equivalent |

### Hover Surfaces → SURFACE/COMPONENT tokens

| Hardcoded Pattern | Token |
|---|---|
| `hover:bg-zinc-100 dark:hover:bg-zinc-800` | Part of `SURFACE.hoverSubtle` |
| `hover:bg-zinc-50 dark:hover:bg-zinc-800/50` | Part of `COMPONENT.sidebarItemDefault` |
| `hover:bg-zinc-200 dark:hover:bg-zinc-700` | Part of `COMPONENT.menuButtonHover` |
| `hover:bg-parchment-200 dark:hover:bg-night-650` | Part of `COMPONENT.menuButtonHover` |
| `p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors` | `COMPONENT.iconButton` (adjust rounding if needed) |

### Border Colors → BORDER tokens

| Hardcoded Pattern | Token |
|---|---|
| `border-zinc-200 dark:border-zinc-700` | `BORDER.strong` |
| `border-parchment-300 dark:border-night-650` | `BORDER.strong` |
| `border-zinc-200/70 dark:border-zinc-800` | `BORDER.default` |
| `border-zinc-200 dark:border-zinc-800` | `BORDER.default` |
| `border-zinc-200 dark:border-zinc-800/60` | `BORDER.subtle` |
| `border-zinc-300 dark:border-zinc-600` | `BORDER.selectedCard` |
| `border-zinc-200 dark:border-zinc-600` | `BORDER.selectedCard` |
| `border-zinc-300 dark:border-zinc-700` | `BORDER.strong` |

### Button Patterns → COMPONENT tokens

| Hardcoded Pattern | Token |
|---|---|
| `bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900` | `COMPONENT.primaryButton` |
| `bg-parchment-900 dark:bg-night-100 text-white dark:text-night-900` | `COMPONENT.primaryButton` |
| `bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700` | `COMPONENT.secondaryButton` |
| `text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800` | `COMPONENT.iconButtonSm` + `SURFACE.hoverSubtle` |
| `text-parchment-600 hover:text-parchment-800 dark:hover:text-night-300` | `COMPONENT.iconButtonSm` (text + hover) |
| `hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors` | `COMPONENT.iconButton` pattern |

### Tab Patterns → COMPONENT tokens (new)

| Hardcoded Pattern | Token |
|---|---|
| `border-zinc-900 dark:border-zinc-100 ${TEXT.heading}` (active tab) | `COMPONENT.tabActive` |
| `border-transparent ${TEXT.muted} hover:text-zinc-600 dark:hover:text-zinc-300` | `COMPONENT.tabDefault` |
| `border-transparent ${TEXT.muted} hover:text-zinc-700 dark:hover:text-zinc-300` | `COMPONENT.tabDefault` |
| `border-transparent ${TEXT.faint} hover:text-zinc-600 dark:hover:text-zinc-300` | `COMPONENT.tabDefault` |

### Focus Ring → BORDER tokens

| Hardcoded Pattern | Token |
|---|---|
| `focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600` | Part of `BORDER.inputFocus` |
| `focus:ring-2 focus:ring-zinc-300/40` | Part of `BORDER.inputFocus` |
| `focus:ring-2 focus:ring-zinc-400` | Part of `BORDER.inputFocus` |

### Tooltip → SURFACE tokens (new)

| Hardcoded Pattern | Token |
|---|---|
| `bg-zinc-800 dark:bg-zinc-700 text-zinc-200 text-[11px] ... rounded-md shadow-lg` | `SURFACE.tooltip` + sizing |

### Full Input Fields → COMPONENT tokens (new)

| Hardcoded Pattern | Token |
|---|---|
| `bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600` | `COMPONENT.inlineInput` + sizing (w-full, h-XX, p-X) |
| `placeholder-zinc-400 dark:placeholder-zinc-500` | Add to `COMPONENT.inlineInput` as `placeholder:text-parchment-600 dark:placeholder:text-night-500` |

### List Rows → COMPONENT tokens (new)

| Hardcoded Pattern | Token |
|---|---|
| `flex items-center gap-2 text-left w-full px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 rounded-lg transition-colors cursor-pointer` | `COMPONENT.listRow` |

---

## Per-File Changes

### Chat Components (13 files)

**`src/features/chat/components/ChatPanel.tsx`**
Already imports theme tokens. Replace:
- Lines 143, 152: `p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors` → use `COMPONENT.iconButton` or compose `${SURFACE.hoverSubtle} p-2 rounded-lg transition-colors`
- Lines 146, 155: `text-zinc-500` → `${TEXT.muted}`
- Line 184: `text-zinc-800 dark:text-zinc-200` → `${TEXT.primary}`
- Line 187: `text-zinc-500` → `${TEXT.muted}`
- Line 192: `text-zinc-400 uppercase` → `${TEXT.faint}`
- Line 199: `bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 ... text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700` → `${SURFACE.card} border ${BORDER.strong} ... ${TEXT.secondary} ${SURFACE.hoverSubtle}` or use `COMPONENT.suggestionButton`

**`src/features/chat/components/ChatHistoryList.tsx`**
Add import. Heavy file — 14 zinc refs. Replace:
- Line 60: `border-zinc-200/70 dark:border-zinc-800` → `${BORDER.default}`
- Line 62: `text-zinc-700 dark:text-zinc-300` → `${TEXT.secondary}`
- Line 67: `text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300` → `${TEXT.muted}` + hover
- Line 75: `text-zinc-400` → `${TEXT.faint}`
- Line 81: `bg-zinc-100 dark:bg-zinc-800/70 border border-zinc-200/80 dark:border-zinc-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-zinc-300/40` → `${COMPONENT.inlineInput}`
- Line 89: `text-zinc-400 text-sm` → `${TEXT.faint}`
- Lines 99-100: `bg-zinc-100 dark:bg-zinc-800` / `hover:bg-zinc-50 dark:hover:bg-zinc-800/50` → `${SURFACE.selected}` / part of `${COMPONENT.sidebarItemDefault}`
- Line 104: `text-zinc-400` → `${TEXT.faint}`
- Line 116: full input → `${COMPONENT.inlineInput}`
- Line 133: `text-zinc-800 dark:text-zinc-200` → `${TEXT.primary}`
- Line 138: `text-zinc-500` → `${TEXT.muted}`
- Line 142: `text-zinc-400` → `${TEXT.faint}`
- Line 153: `text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 ... hover:bg-zinc-200 dark:hover:bg-zinc-700` → `${COMPONENT.iconButtonSm}` + `${COMPONENT.menuButtonHover}`
- Line 162: `text-zinc-400 hover:text-red-500 hover:bg-zinc-200 dark:hover:bg-zinc-700` → `${COMPONENT.destructiveHover}` + `${COMPONENT.menuButtonHover}`

**`src/features/chat/components/MarkdownCodeBlock.tsx`**
Add import. Replace:
- Line 115: `border border-zinc-200 dark:border-zinc-700` → `border ${BORDER.strong}`
- Line 117: `bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700` → `${SURFACE.selectedCard} border-b ${BORDER.strong}`
- Line 120: `text-zinc-600 dark:text-zinc-400` → `${TEXT.secondary}`
- Line 126: `text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700` → compose from `${TEXT.muted}` + hover tokens
- Line 138: `bg-white dark:bg-zinc-900` → `${SURFACE.card}`

**`src/features/chat/components/message/AssistantActionBar.tsx`**
Already imports some tokens. Replace:
- Line 54: `bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 shadow-sm` → active copy state: `${SURFACE.card} ${TEXT.primary} shadow-sm` (or new token if desired)
- Line 55: `text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300` → `${TEXT.faint}` + hover via `COMPONENT.iconButtonSm`
- Line 67: `bg-zinc-100 dark:bg-zinc-800/60 rounded-md p-0.5` → `${SURFACE.inset} rounded-md p-0.5`
- Line 76: `text-zinc-400 dark:text-zinc-500` → `${TEXT.faint}`
- Line 87: same button pattern → `${COMPONENT.iconButtonSm}` + `${SURFACE.hoverSubtle}`
- Line 90: `bg-zinc-800 dark:bg-zinc-700 text-zinc-200` → `${SURFACE.tooltip}`
- Line 106: `text-zinc-400 dark:text-zinc-500` → `${TEXT.faint}`

**`src/features/chat/components/message/ActionButton.tsx`**
Add import. Replace:
- Line 17: `text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800` → `${TEXT.faint} hover:text-parchment-800 dark:hover:text-night-300 ${SURFACE.hoverSubtle}`

**`src/features/chat/components/message/SuggestionsList.tsx`**
Add import. Replace:
- Line 8: entire `rowClass` const → `COMPONENT.listRow`
- Line 20: `text-zinc-300 dark:text-zinc-600` → `${TEXT.faint}` (decorative arrow)

**`src/features/chat/components/message/SourcesList.tsx`**
Add import. Replace:
- Line 15: `rowClass` → `COMPONENT.listRow`
- Line 17: `sourceRowClass` → `COMPONENT.listRow` (adjust padding: px-2.5 py-1.5 text-xs)
- Line 36: `text-zinc-400 dark:text-zinc-500` → `${TEXT.faint}`
- Line 38: `text-zinc-400 dark:text-zinc-500` → `${TEXT.faint}`
- Line 59: same → `${TEXT.faint}`
- Line 67: `text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300` → `${TEXT.faint}` + hover

**`src/features/chat/components/AnimatedProviderIcon.tsx`**
- Line 43: `bg-white dark:bg-zinc-900` → `${SURFACE.card}`

**`src/features/chat/components/MediaPartRenderer.tsx`**
- Line 122: `bg-zinc-100 dark:bg-zinc-800` → `${SURFACE.selectedCard}`
- Line 123: `text-zinc-500` → `${TEXT.muted}`

**`src/features/chat/components/ToolActivityIndicator.tsx`**
- Line 87: `border-zinc-400 dark:border-zinc-500` → close to `${BORDER.strong}` or `${TEXT.faint}` colors
- Line 91: `text-zinc-400 dark:text-zinc-500` → `${TEXT.faint}`
- Line 94: `text-zinc-500 dark:text-zinc-400` → `${TEXT.muted}`

**`src/features/chat/components/WebCitationDrawer.tsx`**
Already imports tokens.
- Line 81: `hover:bg-zinc-100 dark:hover:bg-zinc-800/60` → `${SURFACE.hoverSubtle}`

**`src/features/chat/components/MeetingCitationDrawer.tsx`**
Already imports tokens.
- Lines 95-96: tab active/default → `${COMPONENT.tabActive}` / `${COMPONENT.tabDefault}`

---

### Recording Components (5 files)

**`src/features/recording/components/RecordingControls.tsx`**
Add import. Heavy file — 12 zinc refs. Replace:
- Line 59: `text-zinc-700 dark:text-zinc-300` → `${TEXT.secondary}`
- Line 68: `text-zinc-500` → `${TEXT.muted}`
- Line 111: `border border-zinc-200 dark:border-zinc-800 ... hover:bg-zinc-50 dark:hover:bg-zinc-800` → `border ${BORDER.default} ${COMPONENT.sidebarItemDefault}`
- Line 117: `bg-zinc-900 text-white ... hover:bg-zinc-800` → `${COMPONENT.primaryButton}` + shadow
- Line 131: `text-zinc-700 dark:text-zinc-300` → `${TEXT.secondary}`
- Line 143: `border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800` → `${BORDER.strong}` + hover
- Line 146: `text-zinc-500` → `${TEXT.muted}`
- Line 150: `text-zinc-700 dark:text-zinc-300` → `${TEXT.secondary}`
- Line 153: `text-zinc-500` → `${TEXT.muted}`
- Line 161: `text-zinc-500 dark:text-zinc-400` → `${TEXT.muted}`

**`src/features/recording/components/MinimizedRecordingBar.tsx`**
Add import. Replace:
- Line 39: `bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700` → `${SURFACE.card} border ${BORDER.strong}` + remaining layout
- Line 44: `text-zinc-700 dark:text-zinc-300` → `${TEXT.secondary}`
- Line 50: `hover:bg-zinc-100 dark:hover:bg-zinc-800` → `${SURFACE.hoverSubtle}` (strip hover: since hoverSubtle includes it)... actually `SURFACE.hoverSubtle` already includes `hover:`. So use it directly.
- Line 53: `text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300` → `${TEXT.muted}` + group-hover variant
- Line 60: `text-zinc-400` → `${TEXT.faint}`
- Line 61: `text-zinc-900 dark:text-zinc-100` → `${TEXT.primary}`
- Line 65: `text-zinc-500 dark:text-zinc-400` → `${TEXT.muted}`

**`src/features/recording/components/RecordingViewModal.tsx`**
Add import. Replace:
- Line 37: `bg-white dark:bg-zinc-950` → `${SURFACE.page}` (non-vibrancy) or `bg-parchment-50 dark:bg-night-950`
- Line 53: `hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl` → `${SURFACE.hoverSubtle} rounded-xl`
- Line 56: `text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300` → `${TEXT.muted}` + group-hover
- Line 66: `text-zinc-400` → `${TEXT.faint}`
- Line 74: `text-zinc-900 dark:text-white` → `${TEXT.heading}`

**`src/features/recording/components/RecordingWidget.tsx`**
Already imports tokens.
- Line 125: `bg-zinc-700 dark:bg-zinc-500` → a status dot color, use `${TEXT.muted}` equivalent as bg, or keep as semantic

**Phase 4 files (already have parchment/night, convert to tokens):**

**`src/features/recording/components/RecordButton.tsx`**
- Line 79: `text-parchment-900 dark:text-night-50` → `${TEXT.heading}`

**`src/features/recording/components/RecordingTimer.tsx`**
- Line 27: `text-parchment-600` → `${TEXT.faint}`
- Line 29: `text-parchment-900 dark:text-night-100` → `${TEXT.primary}`
- Line 38: `bg-parchment-200 text-parchment-800 dark:bg-night-800 dark:text-night-400` → `${SURFACE.chip} ${TEXT.secondary}` (for stopped badge)

---

### Notes Components (3 files)

**`src/features/notes/components/NoteEditor.tsx`**
Add import. Replace:
- Line 53: `bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/60` → `${SURFACE.card} border ${BORDER.subtle}`
- Line 60: full input → `${COMPONENT.inlineInput}` + sizing (w-full h-24 p-3) + `placeholder:${TEXT.faint}` equivalent
- Line 63: `text-zinc-400` → `${TEXT.faint}`
- Line 67: `text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700` → `${COMPONENT.secondaryButton}`
- Line 75: `text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900` → `${COMPONENT.primaryButton}`

**`src/features/notes/components/NoteItem.tsx`**
Add import. Replace:
- Line 55: `bg-white dark:bg-zinc-900/40` → `${SURFACE.card}`
- Lines 58-59: `border-zinc-200 dark:border-zinc-800/60 ... hover:border-zinc-300 dark:hover:border-zinc-700` → `${BORDER.subtle}` + `${BORDER.cardHover}`
- Line 65: `text-zinc-500 dark:text-zinc-400` → `${TEXT.muted}`
- Line 82: `hover:bg-zinc-100 dark:hover:bg-zinc-800 ... text-zinc-500 dark:text-zinc-400` → `${COMPONENT.iconButtonSm}` + `${SURFACE.hoverSubtle}`
- Line 104: full textarea → `${COMPONENT.inlineInput}` + sizing
- Line 110: icon button → `${COMPONENT.iconButtonSm}` + `${SURFACE.hoverSubtle}`
- Line 121: `text-zinc-400` → `${TEXT.faint}`
- Line 124: `text-zinc-700 dark:text-zinc-300` → `${TEXT.secondary}`

**`src/features/notes/components/NotesView.tsx`**
Add import. Replace:
- Line 43: `text-zinc-400` → `${TEXT.faint}`
- Line 64: `text-zinc-500 dark:text-zinc-400` → `${TEXT.muted}`
- Line 72: `bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900` → `${COMPONENT.primaryButton}`
- Line 91: `text-zinc-400 dark:text-zinc-500` → `${TEXT.faint}`

---

### Todo Components (2 files)

**`src/features/todos/components/TodoList.tsx`**
Add import. Heavy file — 16 zinc refs. Replace:
- Line 72: `text-zinc-400` → `${TEXT.faint}`
- Line 94: `text-zinc-500 dark:text-zinc-400` → `${TEXT.muted}`
- Line 97: `bg-zinc-200 dark:bg-zinc-800` → `${SURFACE.chip}` (progress track)
- Line 111: `bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900` → `${COMPONENT.primaryButton}`
- Line 120: `border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30` → `border ${BORDER.default} ${SURFACE.subtle}`
- Line 125: full input → `${COMPONENT.inlineInput}` + sizing
- Line 131: `text-zinc-600 dark:text-zinc-400` → `${TEXT.secondary}`
- Line 140: full input → `${COMPONENT.inlineInput}` + sizing
- Line 147: full input → `${COMPONENT.inlineInput}` + sizing
- Line 151: `text-zinc-500 dark:text-zinc-400` → `${TEXT.muted}`
- Line 164: `text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800` → `${COMPONENT.secondaryButton}` or compose
- Line 171: primary button → `${COMPONENT.primaryButton}`
- Line 183: `text-zinc-400 dark:text-zinc-500` → `${TEXT.faint}`
- Line 191: `divide-zinc-100 dark:divide-zinc-800/60` → `divide-parchment-200 dark:divide-night-800/60` (rare case: keep as direct class, no divide token)

**`src/features/todos/components/TodoItem.tsx`**
Add import. Replace:
- Line 74: `border-zinc-300 dark:border-zinc-600 hover:border-green-400` → `${BORDER.selectedCard}` + hover green (semantic)
- Line 89: full input → `${COMPONENT.inlineInput}` + sizing
- Line 95: icon button → `${COMPONENT.iconButtonSm}` + `${SURFACE.hoverSubtle}`
- Lines 111-112: `line-through text-zinc-400 dark:text-zinc-500` / `text-zinc-700 dark:text-zinc-300` → `${TEXT.faint}` / `${TEXT.secondary}`
- Lines 123-124: `text-zinc-400` / `text-zinc-500` → `${TEXT.faint}` / `${TEXT.muted}`
- Line 146: `hover:bg-zinc-100 dark:hover:bg-zinc-800 ... text-zinc-500` → `${SURFACE.hoverSubtle}` + `${TEXT.muted}`

---

### History Components (4 files)

**`src/features/history/components/HistoryItem.tsx`**
Add import. Heavy file. Replace:
- Lines 52-53: `bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 shadow-sm` / `hover:bg-white/70 dark:hover:bg-zinc-800/70` → `${SURFACE.card} ${BORDER.strong}` / `${SURFACE.hoverSubtle}`
- Line 68: full edit input → `${COMPONENT.inlineInput}` + `${TEXT.primary}` + sizing
- Line 72: `text-zinc-800 dark:text-zinc-200` → `${TEXT.primary}`
- Lines 78-79: `text-zinc-500` / `text-zinc-400` → `${TEXT.muted}` / `${TEXT.faint}`
- Line 96: `hover:bg-zinc-200 dark:hover:bg-zinc-700` → `${COMPONENT.menuButtonHover}`
- Line 98: `text-zinc-500 dark:text-zinc-400` → `${TEXT.muted}`
- Line 103: `bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600` → `${SURFACE.dropdown} border ${BORDER.strong}`
- Line 110: `text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-600` → `${TEXT.secondary} ${SURFACE.hoverSubtle}`
- Line 117: `bg-zinc-200 dark:bg-zinc-600` → `${SURFACE.divider}`

**`src/features/history/components/UnifiedSidebarItem.tsx`**
Already imports tokens.
- Line 34: `bg-zinc-200 dark:bg-zinc-700` → `${SURFACE.divider}`

**`src/features/history/components/UnifiedList.tsx`**
- Line 50: `text-zinc-400 text-sm` → `${TEXT.faint}`

**`src/features/history/components/HistoryList.tsx`**
- Line 34: `text-zinc-400 text-sm` → `${TEXT.faint}`

---

### Settings Components (4 files)

**`src/features/settings/components/SettingsPanel.tsx`**
Already imports tokens.
- Line 57: `border-zinc-900 dark:border-zinc-100 ${TEXT.heading}` → `${COMPONENT.tabActive}`
- Line 58: `border-transparent ${TEXT.muted} hover:text-zinc-600 dark:hover:text-zinc-300` → `${COMPONENT.tabDefault}`

**`src/features/settings/components/QualityPresetSelector.tsx`**
Add import. Replace:
- Lines 53, 80, 91: `bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900` → `${COMPONENT.primaryButton}`
- Line 67: `bg-zinc-900 dark:bg-zinc-100` (dot) → use same colors via token

**`src/features/settings/components/ModalityIcons.tsx`**
Add import. Replace:
- Line 158: `bg-zinc-800 dark:bg-zinc-700 rounded-md shadow-lg` → `${SURFACE.tooltip}`
- Line 163: `text-zinc-400` → `${TEXT.faint}`
- Line 164: `text-zinc-200` → in tooltip context, part of `SURFACE.tooltip`'s text

**`src/features/settings/components/shared/RadioCard.tsx`**
Add import. Replace:
- Line 37: `border-zinc-300 dark:border-zinc-700` → `${BORDER.strong}`
- Line 41: `bg-zinc-900 dark:bg-zinc-100` (radio dot) → invert token colors

---

### Home Components (2 files)

**`src/features/home/components/ResultsView.tsx`**
Already imports tokens. Heavy file. Replace:
- Line 254: `hover:text-zinc-900 dark:hover:text-zinc-100` → hover colors from `COMPONENT.iconButton` or `TEXT.heading`
- Lines 299, 312, 327, 341: `hover:text-zinc-700 dark:hover:text-zinc-300` → hover from `COMPONENT.tabDefault`
- Lines 304, 317, 332, 346: `bg-zinc-900 dark:bg-zinc-100` (tab underline) → extract colors from `COMPONENT.tabActive`
- Lines 369, 418: `bg-zinc-200 dark:bg-zinc-800` (divider) → `${SURFACE.divider}`

**`src/features/home/components/ResultsAudioPlayer.tsx`**
Add import. Replace:
- Line 65: `bg-zinc-100 dark:bg-zinc-800/50 ... animate-pulse` → `${SURFACE.skeleton}`

---

### Phase 4 Leftover Files (convert parchment/night → tokens)

**`src/features/chat/components/ChatInput.tsx`**
Already imports tokens. Replace direct parchment/night with tokens:
- Line 293: `hover:ring-parchment-500 dark:hover:ring-night-500` → part of `BORDER.inputFocus`
- Line 304: `hover:bg-parchment-300 dark:hover:bg-night-650` → `${COMPONENT.menuButtonHover}`
- Line 334: `text-parchment-900 dark:text-night-100` → `${TEXT.primary}`
- Line 411: `text-parchment-700` → `${TEXT.muted}`
- Lines 454-455: send button active/disabled → `${COMPONENT.sendButtonActive}` / `${COMPONENT.sendButtonDisabled}`

**`src/features/home/components/IdleView.tsx`**
- Line 84: `text-parchment-900 dark:text-night-50` → `${TEXT.heading}`
- Line 89: `bg-parchment-50 dark:bg-night-900` → `${SURFACE.card}`
- Line 134: full "More" button → compose from `${SURFACE.card} border ${BORDER.strong} ${TEXT.secondary}` + hover

**`src/features/chat/components/ModelPicker.tsx`**
- Lines 123-124: hover/disabled states → compose from `${SURFACE.hoverSubtle} ${TEXT.secondary}` / `${TEXT.faint}`
- Lines 136, 141: `text-parchment-600 dark:text-night-500` → `${TEXT.faint}`

**`src/features/chat/components/message/AssistantMessage.tsx`**
- Line 94: `text-parchment-700 dark:text-night-400` → `${TEXT.muted}`
- Line 104: `text-parchment-600 dark:text-night-500` → `${TEXT.faint}`

**`src/features/chat/components/message/UserMessage.tsx`**
- Line 29: `text-parchment-600 hover:text-parchment-800 dark:hover:text-night-300` → `${TEXT.faint}` + hover
- Line 43: `text-parchment-600` → `${TEXT.faint}`

**`src/features/chat/components/ContextChips.tsx`**
- Line 36: `hover:bg-parchment-200 dark:hover:bg-night-650` → `${COMPONENT.menuButtonHover}`
- Line 39: `text-parchment-600 hover:text-parchment-800 dark:hover:text-night-300` → `${TEXT.faint}` + hover

**`src/shared/components/CodeBlock.tsx`**
- Line 111: `bg-parchment-200 dark:bg-night-800 text-parchment-900 dark:text-night-100` → `${SURFACE.chip} ${TEXT.primary}`
- Line 146: `border border-parchment-300 dark:border-night-650` → `border ${BORDER.strong}`
- Line 148: `bg-parchment-200 dark:bg-night-800 border-b border-parchment-300 dark:border-night-650` → `${SURFACE.selectedCard} border-b ${BORDER.strong}`
- Line 157: `text-parchment-800 dark:text-night-300` → `${TEXT.secondary}`
- Line 166: copy button colors → compose from `${TEXT.muted}` + hover + `${COMPONENT.menuButtonHover}`
- Line 184: `bg-parchment-50 dark:bg-night-900` → `${SURFACE.card}`

---

## Verification

After Phase 3:

```bash
# Should return ZERO results (excluding theme.config.ts, ui.config.ts, CSS files, LANG_META):
grep -rn "zinc-\|parchment-\|night-" src/features/ src/shared/ src/app/ \
  --include="*.tsx" --include="*.ts" \
  | grep -v "theme\.config\|ui\.config\|typography\.config" \
  | grep -v "LANG_META\|brand"
```

The ONLY files with direct color class names should be:
- `src/config/theme.config.ts` — token definitions (parchment/night) ✅
- `src/config/ui.config.ts` — hex values for JS usage ✅
- `src/styles/*.css` — hex values for CSS ✅
- Language icon brand colors in CodeBlock/MarkdownCodeBlock ✅

Everything else: tokens only.
