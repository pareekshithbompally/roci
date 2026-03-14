# Phase 3: Settings Panel Migration

**Goal**: Replace native `<select>` elements and the custom `Toggle` component
in settings panels with the new Radix-based `Select` and `Switch` primitives.

**Risk**: Low. Settings panels are isolated from the chat/recording pipeline.
Changes are purely UI — the underlying settings data flow is unchanged.

**Prerequisite**: Phase 2 complete (Select and Switch primitives exist).

---

## Migration Targets

| File | What Changes | Primitive Used |
|---|---|---|
| `AudioPanel.tsx` | Native `<select>` for transcription model → `Select` | Select |
| `LocalInferencePanel.tsx` | Native `<select>` for model → `Select` | Select |
| `ProvidersPanel.tsx` | Search results dropdown → `Popover` + `Command` | Popover, Command |
| `shared/Toggle.tsx` | Custom toggle → re-export `Switch` | Switch |
| All consumers of Toggle | Import path update | — |

---

## Step 3.1: Migrate AudioPanel Transcription Model Select

**File**: `src/features/settings/components/AudioPanel.tsx`
**Lines**: 165–176

### Current Code (native select)

```tsx
<select
  value={settings.transcriptionModel}
  onChange={(e) => handleTranscriptionModelChange(e.target.value)}
  className={`w-full px-3 py-2.5 ${COMPONENT.settingsInput} ${TYPOGRAPHY_CLASSES.settingsInput}`}
>
  <option value="">Select a model</option>
  {allActiveModels.map((model) => (
    <option key={`transcription-${model.provider}-${model.id}`} value={model.id}>
      {model.name} ({getProviderTitle(model.provider)})
    </option>
  ))}
</select>
```

### New Code (Radix Select)

```tsx
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel } from '@shared/ui';

<Select
  value={settings.transcriptionModel || undefined}
  onValueChange={handleTranscriptionModelChange}
>
  <SelectTrigger className={TYPOGRAPHY_CLASSES.settingsInput}>
    <SelectValue placeholder="Select a model" />
  </SelectTrigger>
  <SelectContent>
    {/* Group models by provider for better UX */}
    {Object.entries(modelsByProvider).map(([provider, models]) => (
      <SelectGroup key={provider}>
        <SelectLabel>{getProviderTitle(provider)}</SelectLabel>
        {models.map((model) => (
          <SelectItem
            key={`transcription-${model.provider}-${model.id}`}
            value={model.id}
          >
            <div className="flex items-center gap-2">
              <ProvidersAvatar provider={model.provider} size={16} />
              <span>{model.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectGroup>
    ))}
  </SelectContent>
</Select>
```

### Benefits

- Provider icons visible directly in the dropdown (no separate preview box)
- Models grouped by provider with labeled sections
- Keyboard navigation (type to search, arrow keys)
- Consistent styling with the rest of the app
- Accessible (ARIA roles, screen reader announcements)

### What to Delete

- The separate "preview" box that currently shows provider avatar/modality
  icons below the select — this info is now inline in the dropdown items.
- Remove the `ModalityIcons` separate display if it was only used for preview.

---

## Step 3.2: Migrate LocalInferencePanel Model Select

**File**: `src/features/settings/components/LocalInferencePanel.tsx`
**Lines**: 346–357

### Current Code

```tsx
<select
  value={selectedModelId ?? ''}
  onChange={(e) => setSelectedModelId(e.target.value || null)}
  className={`w-full px-3 py-2 ${SURFACE.inputField} border ${BORDER.input} rounded-lg ...`}
>
  <option value="">Select a model...</option>
  {managedModels.map((m) => (
    <option key={m.id} value={m.id}>
      {m.name} ({formatBytes(m.fileSize)})
    </option>
  ))}
</select>
```

### New Code

```tsx
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@shared/ui';

<Select
  value={selectedModelId ?? undefined}
  onValueChange={(val) => setSelectedModelId(val || null)}
>
  <SelectTrigger>
    <SelectValue placeholder="Select a model..." />
  </SelectTrigger>
  <SelectContent>
    {managedModels.map((m) => (
      <SelectItem key={m.id} value={m.id}>
        <div className="flex items-center justify-between w-full gap-2">
          <span className="truncate">{m.name}</span>
          <span className="text-xs text-[var(--text-faint)] shrink-0">
            {formatBytes(m.fileSize)}
          </span>
        </div>
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

### Notes

- `value={undefined}` when nothing is selected (Radix uses undefined, not "")
- The file size is shown as a right-aligned secondary label in each item

---

## Step 3.3: Migrate ProvidersPanel Search Dropdown

**File**: `src/features/settings/components/ProvidersPanel.tsx`
**Lines**: ~415–476

### Current Implementation

- `SettingsInput` with onKeyDown (Enter to search, Escape to close)
- Manual `showSearchDropdown` boolean state
- Manual `dropdownAbove` viewport detection
- Absolute-positioned results div with manual z-index

### New Implementation

Replace the manual dropdown with `Popover` + `Command`:

```tsx
import { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from '@shared/ui';
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from '@shared/ui';

<Popover open={showSearchDropdown} onOpenChange={setShowSearchDropdown}>
  <PopoverAnchor asChild>
    <div className="flex gap-2">
      <SettingsInput
        value={modelSearch}
        onChange={(e) => setModelSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSearchModels();
        }}
        placeholder="Search model name..."
        icon={<Search className={`w-4 h-4 ${TEXT.faint}`} />}
      />
      <button onClick={handleSearchModels} ...>Search</button>
    </div>
  </PopoverAnchor>

  <PopoverContent
    side="bottom"
    sideOffset={8}
    align="start"
    className="w-[var(--radix-popover-trigger-width)] p-0"
  >
    <Command>
      <CommandList>
        <CommandEmpty>No models found</CommandEmpty>
        {searchResults.map((modelId) => (
          <CommandItem
            key={modelId}
            value={modelId}
            onSelect={() => handleSelectModel(modelId)}
          >
            <span className="truncate">{modelId}</span>
            {mods && <ModalityIcons input={mods.input} output={mods.output} />}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

### What Gets Deleted

- `searchContainerRef` and click-outside detection
- `dropdownAbove` viewport calculation
- Manual absolute positioning logic
- Manual z-index management

Radix `Popover` handles all of this automatically (viewport collision
detection, click-outside, Escape key, focus management).

---

## Step 3.4: Migrate Toggle → Switch

### Current Toggle

**File**: `src/features/settings/components/shared/Toggle.tsx`

```tsx
interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
  label?: string;
}
```

Custom implementation with `role="switch"`, manual keyboard handlers
(Space/Enter), manual aria-checked, manual transition styles.

### Migration Strategy

**Option A (recommended)**: Replace `Toggle.tsx` with a re-export of the new
`Switch` primitive, preserving the same prop interface:

```tsx
// src/features/settings/components/shared/Toggle.tsx
// Backwards-compatible wrapper — delegates to Radix Switch.
import { Switch } from '@shared/ui';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
  label?: string;
}

export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, size = 'md', disabled, label }) => {
  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        size={size}
        disabled={disabled}
      />
      {label && <span className="text-sm text-[var(--text-secondary)]">{label}</span>}
    </div>
  );
};
```

This approach requires **zero changes** to any Toggle consumer. The import
path stays the same. The visual output is identical. The only difference is
that Radix now handles the underlying behavior (keyboard, ARIA, focus).

**Later**: Once all consumers are verified working, rename imports from
`Toggle` to `Switch` across the codebase and delete the wrapper. This is
optional and can happen in a future cleanup pass.

---

## Step 3.5: Verify No Settings Regressions

After all changes in this phase:

- [ ] AudioPanel: Transcription model select opens, shows grouped models with
      provider icons, keyboard navigable, selection persists
- [ ] LocalInferencePanel: Model select works, shows file sizes, updates
      `selectedModelId` correctly
- [ ] ProvidersPanel: Model search dropdown appears below/above input as
      needed, items clickable, Escape closes, click-outside closes
- [ ] Toggle/Switch: All toggles in settings work (check `ProvidersPanel`
      for provider active toggles)
- [ ] Settings save flow: Unsaved changes detection still works after
      Radix Select/Switch value changes
- [ ] Dark mode: All new components theme correctly
- [ ] `npm run build` succeeds
