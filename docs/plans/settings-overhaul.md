# Settings Panel Overhaul Plan

> Comprehensive phased plan for redesigning the settings panel: design system hardening,
> shared component extraction, layout restructure, and per-panel cleanup.

---

## Current State Summary

**Files in scope:**

| File | Lines | Role |
|------|-------|------|
| `src/config/theme.config.ts` | 271 | Design tokens (SURFACE, BORDER, TEXT, COMPONENT) |
| `src/config/typography.config.ts` | 193 | Typography tokens (TYPOGRAPHY_CLASSES) |
| `src/features/settings/components/SettingsPanel.tsx` | 125 | Shell: sidebar nav + panel switcher |
| `src/features/settings/components/ProvidersPanel.tsx` | 575 | Provider config (API keys, models, toggles) |
| `src/features/settings/components/LocalInferencePanel.tsx` | 622 | llama.cpp engine, models, server, HF token |
| `src/features/settings/components/AudioPanel.tsx` | 266 | Audio source, quality, transcription model |
| `src/features/settings/components/CategoriesPanel.tsx` | 122 | Category CRUD |
| `src/features/settings/components/InterfacePanel.tsx` | 112 | Theme picker, storage path, version |
| `src/features/settings/components/SettingsSaveButton.tsx` | 71 | Fixed-position save button (visual only) |
| `src/features/settings/components/ProvidersPanelErrorBoundary.tsx` | 83 | Error boundary (zero tokens) |
| `src/features/settings/components/ModalityIcons.tsx` | 71 | Model modality badges (hardcoded) |
| `src/shared/components/UnsavedChangesModal.tsx` | 76 | Navigation warning modal |
| `src/shared/components/ModelDownloadModal.tsx` | 264 | RAG model consent modal (zero tokens) |
| `src/shared/contexts/UnsavedChangesContext.tsx` | 123 | Dirty state tracking (flag-based) |
| `components/QualityPresetSelector.tsx` | 163 | Audio quality cards (zero tokens, wrong location) |

**Key metrics from audit:**

- 20+ hardcoded color instances across settings
- 3x copy-pasted save handler logic
- 5 different button padding values (`py-1.5`, `py-2`, `py-2.5`, `py-3`, `px-3`, `px-4`)
- 3 panels missing dark-mode focus states on inputs
- 2 custom controls (toggle, radio) without ARIA attributes
- 4 components operating completely outside the design system
- 15+ repeated section-header patterns with no abstraction
- `pb-20` hack in every panel to avoid fixed save button overlap

---

## Phase 1: Design Token System Hardening

**Goal:** Make the token vocabulary complete enough that no component needs to hardcode colors, spacing, radius, or shadows.

### 1.1 Add missing semantic surface/text/border tokens

**File:** `src/config/theme.config.ts`

Add to `SURFACE`:
```ts
/** Error callout background */
errorCallout: 'bg-red-50/50 dark:bg-red-900/10',

/** Warning callout background */
warningCallout: 'bg-amber-50/50 dark:bg-amber-900/10',

/** Success callout background */
successCallout: 'bg-green-50/50 dark:bg-green-900/10',
```

Add to `BORDER`:
```ts
/** Error callout border */
errorCallout: 'border-red-200/50 dark:border-red-800/30',

/** Warning callout border */
warningCallout: 'border-amber-200/50 dark:border-amber-800/30',

/** Success callout border */
successCallout: 'border-green-200/50 dark:border-green-800/30',
```

Add to `TEXT`:
```ts
/** Info callout text */
infoCallout: 'text-blue-800 dark:text-blue-200',

/** Error callout text */
errorCallout: 'text-red-800 dark:text-red-200',

/** Warning callout text */
warningCallout: 'text-amber-800 dark:text-amber-200',

/** Success callout text */
successCallout: 'text-green-800 dark:text-green-200',
```

### 1.2 Add missing component tokens

**File:** `src/config/theme.config.ts`

Add to `COMPONENT`:
```ts
/** Success action button (start server, confirm) */
successButton: 'bg-green-600 hover:bg-green-700 text-white transition-colors',

/** Accent/save button (blue CTA for save actions) */
accentButton: 'bg-blue-600 hover:bg-blue-700 text-white transition-colors',

/** Accent button disabled state */
accentButtonDisabled: 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 cursor-not-allowed',

/** Progress bar track */
progressTrack: 'bg-zinc-200 dark:bg-zinc-700',

/** Progress bar fill */
progressBar: 'bg-blue-500',

/** Destructive hover (delete icon buttons) */
destructiveHover: 'text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30',
```

### 1.3 Add structural tokens (new section)

**File:** `src/config/theme.config.ts`

```ts
// --- STRUCTURAL TOKENS -------------------------------------------

export const RADIUS = {
  /** Inputs, buttons, small cards */
  md: 'rounded-lg',
  /** Larger cards, selection cards, callouts */
  lg: 'rounded-xl',
  /** Modals */
  xl: 'rounded-2xl',
} as const;

export const SHADOW = {
  /** Dropdowns, floating save button */
  float: 'shadow-lg',
  /** Modals, dialogs */
  modal: 'shadow-2xl',
} as const;

export const SPACING = {
  /** Standard button padding */
  button: 'px-3 py-2',
  /** Primary/larger button padding */
  buttonLg: 'px-4 py-2.5',
  /** Small/compact button padding */
  buttonSm: 'px-3 py-1.5',
  /** Standard input padding */
  input: 'px-3 py-2.5',
  /** Card/list item padding */
  card: 'px-3 py-2.5',
  /** Section card padding (callouts, info boxes) */
  callout: 'px-4 py-3',
  /** Gap between sections */
  sectionGap: 'space-y-8',
  /** Gap between fields within a section */
  fieldGap: 'space-y-3',
} as const;
```

### 1.4 Add input composition token

**File:** `src/config/theme.config.ts`

Add to `COMPONENT`:
```ts
/** Standard settings input field (surface + border + focus + radius) */
settingsInput: `${SURFACE.inputField} border ${BORDER.input} ${RADIUS.md} outline-none ${BORDER.inputFocus} transition-all`,

/** Disabled input modifier */
inputDisabled: 'disabled:opacity-50 disabled:cursor-not-allowed',
```

**Rationale:** Every input in settings assembles `${SURFACE.inputField} border ${BORDER.input} rounded-lg outline-none focus:ring-2 ...` manually. 3 of 5 panels forget the dark-mode focus ring. A single token fixes all of them.

### 1.5 Checklist

- [ ] Add `SURFACE.errorCallout`, `warningCallout`, `successCallout`
- [ ] Add `BORDER.errorCallout`, `warningCallout`, `successCallout`
- [ ] Add `TEXT.infoCallout`, `errorCallout`, `warningCallout`, `successCallout`
- [ ] Add `COMPONENT.successButton`, `accentButton`, `accentButtonDisabled`
- [ ] Add `COMPONENT.progressTrack`, `progressBar`, `destructiveHover`
- [ ] Add `COMPONENT.settingsInput`, `inputDisabled`
- [ ] Add `RADIUS`, `SHADOW`, `SPACING` exports
- [ ] Update exports in theme.config.ts barrel

---

## Phase 2: Shared Component Extraction

**Goal:** Extract the 6 repeated UI patterns into reusable, token-based, accessible components.

### 2.1 `<SettingsSection>`

**File:** `src/features/settings/components/shared/SettingsSection.tsx`

**Replaces:** 15+ manual `<div className="space-y-3"><h5 className={settingsLabel + TEXT.faint}>Title</h5>` blocks across all panels.

```tsx
interface SettingsSectionProps {
  title: string;
  icon?: React.FC<{ className?: string }>;
  children: React.ReactNode;
}
```

- Renders the section label with `TYPOGRAPHY_CLASSES.settingsLabel` + `TEXT.faint`
- Optional icon with standardized `w-3.5 h-3.5` size
- Wraps children in `SPACING.fieldGap`
- No behavior, pure layout

**Used in:** Every panel (AudioPanel, ProvidersPanel, LocalInferencePanel, CategoriesPanel, InterfacePanel)

### 2.2 `<SettingsInput>`

**File:** `src/features/settings/components/shared/SettingsInput.tsx`

**Replaces:** 8+ manually-assembled input fields with inconsistent focus/radius/padding.

```tsx
interface SettingsInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helper?: string;
  error?: string;
  icon?: React.ReactNode;    // left icon (e.g., Search)
  actions?: React.ReactNode;  // right-side action buttons
}
```

- Applies `COMPONENT.settingsInput` (the new composition token) + `SPACING.input`
- Applies `TYPOGRAPHY_CLASSES.settingsInput` for font
- Renders optional label with `TYPOGRAPHY_CLASSES.settingsInputLabel` + `TEXT.muted`
- Renders optional helper with `TYPOGRAPHY_CLASSES.settingsHelper` + `TEXT.faint`
- Renders optional error with `TYPOGRAPHY_CLASSES.settingsHelper` + `TEXT.error`
- Left icon positioning via `pl-9` offset
- Right actions slot via absolute positioning

**Used in:** ProvidersPanel (API key, base URL, model search), LocalInferencePanel (number inputs, HF token), CategoriesPanel (new category), AudioPanel (select)

### 2.3 `<SecretInput>`

**File:** `src/features/settings/components/shared/SecretInput.tsx`

**Replaces:** Eye-toggle + copy-button pattern in ProvidersPanel (lines 381-403) and LocalInferencePanel (lines 587-602).

```tsx
interface SecretInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  label?: string;
  helper?: string;
  showCopy?: boolean;   // defaults true
  disabled?: boolean;
}
```

- Wraps `<SettingsInput>` with built-in eye toggle and optional copy button in the `actions` slot
- Manages `showSecret` state internally
- Copy feedback uses `TEXT.success` check icon with auto-reset timeout
- Standardized icon sizes: `w-4 h-4` for ProvidersPanel variant, `w-3.5 h-3.5` for compact

**Used in:** ProvidersPanel (API key), LocalInferencePanel (HF token)

### 2.4 `<Toggle>`

**File:** `src/features/settings/components/shared/Toggle.tsx`

**Replaces:** Inline div toggle in ProvidersPanel (lines 266-279).

```tsx
interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: 'sm' | 'md';   // sm = current 12x20px, md = standard 16x28px
  disabled?: boolean;
  label?: string;        // sr-only label for accessibility
}
```

- Uses `COMPONENT.toggleActive` / `COMPONENT.toggleInactive` tokens
- Adds `role="switch"`, `aria-checked`, `aria-label`
- Keyboard support: Space/Enter to toggle
- Knob color via new token (not hardcoded `bg-white`)

**Used in:** ProvidersPanel (provider enable/disable)

### 2.5 `<RadioCard>`

**File:** `src/features/settings/components/shared/RadioCard.tsx`

**Replaces:** Custom radio in AudioPanel (lines 141-179) and theme cards in InterfacePanel (lines 51-66).

```tsx
interface RadioCardProps {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}
```

- Uses `SURFACE.selectedCard`/`BORDER.selectedCard` when selected, `SURFACE.card`/`BORDER.default`/`BORDER.cardHover` otherwise
- Optional radio dot indicator (like AudioPanel's current custom dot)
- Adds `role="radio"`, `aria-checked`
- Apply `RADIUS.lg` consistently

**Used in:** AudioPanel (input source cards), InterfacePanel (theme selection cards)

### 2.6 `<InfoCallout>`

**File:** `src/features/settings/components/shared/InfoCallout.tsx`

**Replaces:** 4+ different handcrafted info/callout boxes across ProvidersPanel and AudioPanel.

```tsx
interface InfoCalloutProps {
  variant?: 'info' | 'warning' | 'error' | 'success' | 'neutral';
  icon?: React.ReactNode;
  children: React.ReactNode;
}
```

- Maps `variant` to corresponding `SURFACE.*Callout`, `BORDER.*Callout`, `TEXT.*Callout` tokens
- `neutral` uses `SURFACE.subtle` + `BORDER.default` (for the OpenAI-compatible banner)
- Default icon: `Info` for info, `AlertTriangle` for warning, etc.
- Applies `SPACING.callout` + `RADIUS.md`

**Used in:** ProvidersPanel (SDK info, OpenAI-compatible), AudioPanel (permission note, no-models), ProvidersPanelErrorBoundary (error state)

### 2.7 `<ModelListItem>`

**File:** `src/features/settings/components/shared/ModelListItem.tsx`

**Replaces:** Near-identical model row in ProvidersPanel (lines 523-547) and LocalInferencePanel (lines 540-571).

```tsx
interface ModelListItemProps {
  name: string;
  subtitle?: string;                  // e.g., file size, quant, source
  selected?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
  deleteDisabled?: boolean;
  rightSlot?: React.ReactNode;        // e.g., ModalityIcons
}
```

- Uses `SURFACE.subtle`/`SURFACE.selectedCard` + `BORDER.default`/`BORDER.selectedCard`
- Delete button uses new `COMPONENT.destructiveHover` token
- Consistent icon size: `w-3.5 h-3.5` for delete
- Applies `SPACING.card` + `RADIUS.md`

**Used in:** ProvidersPanel (selected models list), LocalInferencePanel (installed models list)

### 2.8 Checklist

- [ ] Create `src/features/settings/components/shared/` directory
- [ ] Implement `SettingsSection`
- [ ] Implement `SettingsInput`
- [ ] Implement `SecretInput` (wraps SettingsInput)
- [ ] Implement `Toggle` with ARIA
- [ ] Implement `RadioCard` with ARIA
- [ ] Implement `InfoCallout` with variant system
- [ ] Implement `ModelListItem`
- [ ] Create barrel export `shared/index.ts`

---

## Phase 3: Save Behavior Consolidation

**Goal:** Unify save behavior across all panels — eliminate 3x duplicated handler, fix positioning, standardize save-vs-autosave.

### 3.1 `useSettingsSave` hook

**File:** `src/features/settings/hooks/useSettingsSave.ts`

**Replaces:** Identical try/catch/toast save logic in ProvidersPanel (113-125), AudioPanel (89-101), CategoriesPanel (42-54).

```tsx
function useSettingsSave(panelName: string) {
  const { saveSettings } = useSettings();
  const { showToast } = useToast();
  const { hasUnsavedChanges, clearUnsavedChanges } = useUnsavedChanges();
  const [isSaving, setIsSaving] = useState(false);

  const save = useCallback(async () => {
    setIsSaving(true);
    try {
      await saveSettings();
      clearUnsavedChanges();
      showToast(`${panelName} saved successfully`, 'success');
    } catch (error) {
      console.error(`[${panelName}] Failed to save:`, error);
      showToast(`Failed to save ${panelName.toLowerCase()}`, 'error');
    } finally {
      setIsSaving(false);
    }
  }, [saveSettings, clearUnsavedChanges, showToast, panelName]);

  return { isSaving, hasUnsavedChanges, save };
}
```

**Usage in panels:**
```tsx
const { isSaving, hasUnsavedChanges, save } = useSettingsSave('Audio settings');
// ...
<SettingsSaveButton isSaving={isSaving} hasUnsavedChanges={hasUnsavedChanges} onSave={save} />
```

Each panel drops ~15 lines of boilerplate.

### 3.2 Fix SettingsSaveButton positioning

**File:** `src/features/settings/components/SettingsSaveButton.tsx`

**Current problem:** `fixed bottom-6 right-6 z-50` is viewport-relative. Every panel adds `pb-20` to compensate.

**Fix:** Change to `sticky bottom-0` inside the scroll container. The panel wrapper in `SettingsPanel.tsx` already has `overflow-y-auto`, so sticky will work within that scroll context.

**Changes:**
1. `SettingsSaveButton`: Change `fixed bottom-6 right-6 z-50` to `sticky bottom-0` with padding and background gradient
2. Remove `pb-20` from AudioPanel, CategoriesPanel, ProvidersPanel
3. Use tokens for button colors: `COMPONENT.accentButton` when active, `COMPONENT.accentButtonDisabled` when saved

### 3.3 Standardize save-vs-autosave decision

**Current state:**
- ProvidersPanel, AudioPanel, CategoriesPanel: explicit save button + dirty tracking
- LocalInferencePanel: auto-saves config on change, HF token on blur
- InterfacePanel: instant apply (theme), no save, no dirty tracking

**Decision:** Keep the split but make it intentional:
- **Explicit save** for panels where changes affect external services (providers, audio, categories)
- **Auto-save** is acceptable for LocalInferencePanel (server config is local-only, HF token is a single field)
- **Instant apply** is acceptable for InterfacePanel (theme is visual-only, no persistence risk)

**No code change needed for save/autosave pattern itself.** The inconsistency was accidental but the current behavior is actually reasonable for each panel's use case. Just remove the `pb-20` hacks and fix the save button positioning.

### 3.4 Checklist

- [ ] Create `src/features/settings/hooks/useSettingsSave.ts`
- [ ] Refactor ProvidersPanel to use `useSettingsSave`
- [ ] Refactor AudioPanel to use `useSettingsSave`
- [ ] Refactor CategoriesPanel to use `useSettingsSave`
- [ ] Fix SettingsSaveButton positioning (fixed -> sticky)
- [ ] Replace hardcoded blue/zinc in SettingsSaveButton with `COMPONENT.accentButton` / `accentButtonDisabled`
- [ ] Remove `pb-20` from AudioPanel, CategoriesPanel, ProvidersPanel

---

## Phase 4: Layout Restructure (Vertical Nav -> Horizontal Tabs)

**Goal:** Replace the `w-52` sidebar nav with a horizontal tab bar. Content gets full width.

### 4.1 Tab bar design

**File:** `src/features/settings/components/SettingsPanel.tsx`

**Current layout:**
```
[  nav (w-52)  |  content (flex-1, p-6 md:p-8, overflow-y-auto)  ]
```

**New layout:**
```
[  tab bar (full width, sticky top)                               ]
[  content (full width, max-w-2xl mx-auto, p-6 md:p-8, scroll)   ]
```

**Tab bar structure:**
```tsx
<div className="border-b ${BORDER.default} px-6 md:px-8">
  <div className="flex gap-1 -mb-px max-w-2xl">
    {panels.map(({ id, icon: Icon, label }) => (
      <button
        key={id}
        onClick={() => handlePanelChange(id)}
        className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
          activePanel === id
            ? `border-zinc-900 dark:border-zinc-100 ${TEXT.heading}`
            : `border-transparent ${TEXT.muted} hover:${TEXT.secondary}`
        }`}
      >
        <Icon className="w-4 h-4" />
        {label}
      </button>
    ))}
  </div>
</div>
```

**Content area changes:**
- Remove the `w-52` sidebar + `border-r`
- Content area: `flex-1 overflow-y-auto custom-scrollbar`
- Inner content wrapper: `max-w-2xl mx-auto p-6 md:p-8`
- This gives every panel a consistent, centered content column

### 4.2 Move InterfacePanel state into itself

**Current problem:** `SettingsPanel.tsx` manages storage path state (lines 35-65) and passes it as props to InterfacePanel. This is the only panel receiving props — all others are self-contained.

**Fix:** Move `storagePath`, `storagePathError`, `storagePathCopied`, `handleCopyStoragePath` into InterfacePanel itself. It should load its own state via `useEffect` on mount, just like every other panel.

This simplifies SettingsPanel to pure routing: tab bar + panel switcher.

### 4.3 Move `UnsavedChangesModal` rendering

Currently `<UnsavedChangesModal />` is rendered inside `SettingsPanel.tsx`. Since it's a fixed overlay anyway, it could live at the App level. But since it's only relevant in settings, keeping it here is fine — just noting it's correctly scoped.

### 4.4 Checklist

- [ ] Rewrite SettingsPanel layout: remove sidebar, add horizontal tab bar
- [ ] Add `max-w-2xl mx-auto` content wrapper
- [ ] Add new COMPONENT token for active/inactive tab states
- [ ] Move InterfacePanel storage path state into InterfacePanel
- [ ] Remove prop interface from InterfacePanel
- [ ] Test tab bar with all 5 panels (including tauri-only conditional)
- [ ] Verify unsaved changes warning still works on tab switch

---

## Phase 5: Per-Panel Token Sweep & Component Adoption

**Goal:** Go through each panel and replace all hardcoded values with tokens + shared components.

### 5.1 ProvidersPanel.tsx

| Line(s) | Current | Replace With |
|---------|---------|-------------|
| 330 | `bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30` | `<InfoCallout variant="info">` |
| 331 | `text-blue-500 dark:text-blue-400` | Handled by InfoCallout icon |
| 332 | `text-blue-700 dark:text-blue-300` | Handled by InfoCallout text |
| 339-344 | Manual neutral info box | `<InfoCallout variant="neutral">` |
| 266-279 | Inline toggle div | `<Toggle>` component |
| 321, 435, 519 | Manual section headers | `<SettingsSection>` |
| 366-411 | Manual input assembly | `<SettingsInput>` / `<SecretInput>` for API key |
| 379 | `focus:ring-2 focus:ring-zinc-300/50 focus:border-zinc-300` (no dark) | `COMPONENT.settingsInput` (includes dark focus) |
| 425 | `text-blue-600 dark:text-blue-400` | `TEXT.link` (already exists) |
| 443-460 | Manual search input | `<SettingsInput icon={<Search>}>` |
| 523-547 | Model list items | `<ModelListItem>` |
| 539 | `text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30` | `COMPONENT.destructiveHover` |
| 386 | `text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300` | `COMPONENT.iconButtonSm` |

### 5.2 AudioPanel.tsx

| Line(s) | Current | Replace With |
|---------|---------|-------------|
| 135-136 | Manual section header | `<SettingsSection>` |
| 141-179 | Handcrafted radio cards | `<RadioCard>` |
| 152-160 | Custom div radio dot (no ARIA) | Built into `<RadioCard>` |
| 184-185 | Manual section header | `<SettingsSection>` |
| 198-199 | Manual section header | `<SettingsSection>` |
| 207 | `focus:ring-2 focus:ring-zinc-300/50 focus:border-zinc-300` (no dark) | `COMPONENT.settingsInput` |
| 237-241 | Info callout with hardcoded `text-blue-900 dark:text-blue-100` | `<InfoCallout variant="info">` |
| 246-253 | Another info callout with hardcoded text | `<InfoCallout variant="info">` |
| 89-101 | Manual save handler | `useSettingsSave('Audio settings')` |
| 124 | `pb-20` | Remove (fixed by Phase 3.2) |

### 5.3 CategoriesPanel.tsx

| Line(s) | Current | Replace With |
|---------|---------|-------------|
| 59 | `settingsTitle` without `TEXT.heading` | Add `TEXT.heading` |
| 62-63 | `settingsDescription` without `TEXT.muted` | Add `TEXT.muted` |
| 75 | `rounded-xl` on input | `RADIUS.md` (standardize to `rounded-lg`) |
| 75 | `focus:ring-2 focus:ring-zinc-300/50` (no dark) | `COMPONENT.settingsInput` |
| 80 | `rounded-xl` on button | `RADIUS.md` |
| 92 | `rounded-xl` on card | `RADIUS.md` |
| 97 | `hover:text-red-500 hover:bg-zinc-200 dark:hover:bg-zinc-800` | `COMPONENT.destructiveHover` |
| 42-54 | Manual save handler | `useSettingsSave('Categories')` |
| 57 | `pb-20` | Remove |

### 5.4 InterfacePanel.tsx

| Line(s) | Current | Replace With |
|---------|---------|-------------|
| 46-47 | Manual section header | `<SettingsSection>` |
| 51-66 | Manual theme cards | `<RadioCard>` for each theme option |
| 73 | Manual section header | `<SettingsSection>` |
| 78 | `text-sm ${TEXT.secondary}` hardcoded | Use `TYPOGRAPHY_CLASSES.settingsInput` + `TEXT.secondary` |
| 87 | `text-green-500` for check icon | `TEXT.success` |
| 95 | `text-red-500` for error | `TEXT.error` |
| 102 | `text-sm` hardcoded | Use `TYPOGRAPHY_CLASSES.settingsInput` |

### 5.5 LocalInferencePanel.tsx

| Line(s) | Current | Replace With |
|---------|---------|-------------|
| 253-254 | Manual section headers | `<SettingsSection>` (all 5 sections) |
| 292 | `bg-green-600 hover:bg-green-700 text-white` | `COMPONENT.successButton` |
| 386 | `bg-zinc-200 dark:bg-zinc-700` progress track | `COMPONENT.progressTrack` |
| 388 | `bg-blue-500` progress bar | `COMPONENT.progressBar` |
| 440, 479, 497, 518 | Inputs with manual assembly | `<SettingsInput>` (uses `COMPONENT.settingsInput`) |
| 540-571 | Model list items | `<ModelListItem>` |
| 565 | `text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30` | `COMPONENT.destructiveHover` |
| 587-602 | Manual eye toggle for HF token | `<SecretInput>` |
| 598 | `` hover:${TEXT.secondary} `` (dynamic class — Tailwind can't purge this) | Use full class string from token |

### 5.6 ProvidersPanelErrorBoundary.tsx

**This entire component has zero token imports.** Replace all hardcoded classes:

| Line(s) | Current | Replace With |
|---------|---------|-------------|
| 48 | `bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6` | `SURFACE.errorCallout border BORDER.errorCallout RADIUS.lg SPACING.callout` (plus extra padding) |
| 49 | `text-lg font-semibold text-red-900 dark:text-red-100` | `TYPOGRAPHY_CLASSES.settingsTitle TEXT.errorCallout` |
| 52 | `text-sm text-red-700 dark:text-red-300` | `TYPOGRAPHY_CLASSES.settingsDescription TEXT.errorCallout` |
| 57 | `text-xs text-red-600 dark:text-red-400` | `TYPOGRAPHY_CLASSES.settingsHelper TEXT.error` |
| 60 | `text-xs text-red-600 dark:text-red-400 ... bg-red-100 dark:bg-red-900/30` | Token equivalents |
| 67 | `bg-red-600 hover:bg-red-700 text-white rounded-lg` | `COMPONENT.dangerButton RADIUS.md` |

### 5.7 ModalityIcons.tsx

| Line(s) | Current | Replace With |
|---------|---------|-------------|
| 28 | `text-zinc-500 dark:text-zinc-400` | `TEXT.muted` |
| 50 | `bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/60` | `SURFACE.chip border BORDER.default` |
| 56 | `text-zinc-300 dark:text-zinc-600` | `TEXT.faint` |

### 5.8 ModelDownloadModal.tsx

| Line(s) | Current | Replace With |
|---------|---------|-------------|
| 197 | `bg-black/60 backdrop-blur-sm` | `SURFACE.overlay` |
| 201 | `bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl` | `SURFACE.modal RADIUS.xl SHADOW.modal` |
| 205 | `text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300` | `COMPONENT.iconButtonSm` |
| 212 | `bg-indigo-100 dark:bg-indigo-900/30` | `SURFACE.infoCallout` (or keep indigo as a "feature" accent — discuss) |
| 216 | `text-lg font-semibold text-zinc-900 dark:text-white` | `TYPOGRAPHY_CLASSES.settingsTitle TEXT.heading` |
| 220 | `text-sm text-zinc-600 dark:text-zinc-400` | `TYPOGRAPHY_CLASSES.settingsDescription TEXT.secondary` |
| 224 | `bg-zinc-50 dark:bg-zinc-800/50 ... border border-zinc-200 dark:border-zinc-800` | `SURFACE.subtle border BORDER.default RADIUS.lg` |
| 225-239 | `text-xs text-zinc-500 dark:text-zinc-400` | `TYPOGRAPHY_CLASSES.settingsHelper TEXT.muted` |
| 246 | `bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 ... hover:bg-zinc-200 dark:hover:bg-zinc-700` | `COMPONENT.secondaryButton RADIUS.lg` |
| 252 | `bg-indigo-600 hover:bg-indigo-700 text-white ... shadow-lg shadow-indigo-500/20` | `COMPONENT.accentButton RADIUS.lg SHADOW.float` |

### 5.9 QualityPresetSelector.tsx

**Full rewrite needed.** This component:
1. Lives in root `components/` — move to `src/features/settings/components/shared/` or `src/features/settings/components/`
2. Uses zero design tokens
3. Has mismatched prop interface (`selectedPreset`/`onPresetChange` vs `value`/`onChange` caller convention)

**Rewrite plan:**
- Move to `src/features/settings/components/QualityPresetSelector.tsx`
- Use `<RadioCard>` for each preset option
- Use `SURFACE.chip` for tech spec badges
- Use `<InfoCallout variant="neutral">` for the tip box
- Fix prop names to match AudioPanel caller: `value`/`onChange`
- Remove the duplicate "Audio Quality" label (AudioPanel already renders one via `<SettingsSection>`)

### 5.10 Checklist

- [ ] ProvidersPanel: replace all hardcoded colors, adopt shared components
- [ ] AudioPanel: replace callouts, radio cards, section headers, save handler
- [ ] CategoriesPanel: fix missing text tokens, standardize radius, adopt save hook
- [ ] InterfacePanel: adopt RadioCard, section headers, move storage state in
- [ ] LocalInferencePanel: adopt shared components, fix success button, progress tokens
- [ ] ProvidersPanelErrorBoundary: full token adoption
- [ ] ModalityIcons: token adoption
- [ ] ModelDownloadModal: full token adoption
- [ ] QualityPresetSelector: move file, rewrite with tokens + RadioCard, fix prop interface

---

## Phase 6: SettingsPanel Sidebar Heading Fix ✅ COMPLETE

**Status:** Resolved — the sidebar heading was removed entirely by Phase 4's tab bar rewrite. No `text-[10px]` remains in SettingsPanel.tsx.

---

## Implementation Order & Dependencies

```
Phase 1  (tokens)        — no dependencies, do first
  |
Phase 2  (components)    — depends on Phase 1 tokens
  |
Phase 3  (save behavior) — independent of Phase 2, can parallel
  |
Phase 4  (layout)        — independent, can happen any time after Phase 1
  |
Phase 5  (per-panel sweep) — depends on Phases 1-4 all being done
  |
Phase 6  (minor fix)     — absorbed into Phase 4 or Phase 5
```

**Suggested incremental order:**
1. Phase 1 (tokens) — smallest change, biggest unlock
2. Phase 2 (shared components) — enables Phase 5
3. Phase 3 (save hook + button fix) — quick win, removes duplication
4. Phase 4 (layout restructure) — biggest visual change
5. Phase 5 (sweep) — the cleanup pass, should be smooth after 1-4

Each phase is independently shippable. Panels continue working after each phase — nothing breaks mid-way because tokens are additive and shared components are opt-in until Phase 5 adopts them.

---

## Files Created / Modified Per Phase

### Phase 1
- **Modified:** `src/config/theme.config.ts`

### Phase 2
- **Created:** `src/features/settings/components/shared/SettingsSection.tsx`
- **Created:** `src/features/settings/components/shared/SettingsInput.tsx`
- **Created:** `src/features/settings/components/shared/SecretInput.tsx`
- **Created:** `src/features/settings/components/shared/Toggle.tsx`
- **Created:** `src/features/settings/components/shared/RadioCard.tsx`
- **Created:** `src/features/settings/components/shared/InfoCallout.tsx`
- **Created:** `src/features/settings/components/shared/ModelListItem.tsx`
- **Created:** `src/features/settings/components/shared/index.ts`

### Phase 3
- **Created:** `src/features/settings/hooks/useSettingsSave.ts`
- **Modified:** `src/features/settings/components/SettingsSaveButton.tsx`
- **Modified:** `src/features/settings/components/ProvidersPanel.tsx` (save handler only)
- **Modified:** `src/features/settings/components/AudioPanel.tsx` (save handler only)
- **Modified:** `src/features/settings/components/CategoriesPanel.tsx` (save handler only)

### Phase 4
- **Modified:** `src/features/settings/components/SettingsPanel.tsx` (full rewrite)
- **Modified:** `src/features/settings/components/InterfacePanel.tsx` (self-contained state)

### Phase 5
- **Modified:** All 9 settings components (token + component adoption)
- **Modified:** `src/shared/components/ModelDownloadModal.tsx`
- **Modified:** `src/features/settings/components/ModalityIcons.tsx`
- **Moved:** `components/QualityPresetSelector.tsx` -> `src/features/settings/components/QualityPresetSelector.tsx`
- **Modified:** `src/features/settings/components/ProvidersPanelErrorBoundary.tsx`

---

## Out of Scope (Noted but Not Addressed)

1. **Diff-based dirty tracking** — Current flag-based `UnsavedChangesContext` works. Replacing it with initial-state diffing is a deeper refactor that touches SettingsContext serialization. Not worth it for this pass.

2. **`Surface.tsx` shared component** — Already exists in `src/shared/components/`. It composes SURFACE + BORDER tokens. Settings components don't use it. Could adopt it but the new `<InfoCallout>` and `<SettingsSection>` cover the same ground better for settings-specific use.

3. **Global `<ErrorBoundary>` component** — `ProvidersPanelErrorBoundary` is class-based and settings-specific. A generic shared error boundary could be extracted but that's app-wide scope, not settings-specific.

4. **`components/` root folder cleanup** — 18 components live at root `components/` instead of under `src/`. A broader file organization pass should relocate these, but that's a separate initiative.
