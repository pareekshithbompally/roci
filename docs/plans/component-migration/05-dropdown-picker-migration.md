# Phase 5: Dropdown & Picker Migration

**Goal**: Replace hand-rolled dropdown components (ModelPicker,
MeetingMentionPopup) with Radix `Popover` + `Command` composites. These are
chat-adjacent components that require careful migration to avoid disrupting the
chat experience.

**Risk**: Medium. These components sit near the chat input area. Test
thoroughly after migration to ensure no layout shifts, z-index conflicts, or
keyboard event interference with the chat input.

**Prerequisite**: Phase 2 complete (Popover and Command primitives exist).

---

## Migration Targets

| Component | Current Location | New Approach |
|---|---|---|
| ModelPicker | `src/features/chat/components/ModelPicker.tsx` | Popover + Command |
| MeetingMentionPopup | `src/features/chat/components/MeetingMentionPopup.tsx` | Popover + Command |

---

## Step 5.1: Migrate ModelPicker

**File**: `src/features/chat/components/ModelPicker.tsx`
**Lines**: 228

### Current Implementation Summary

- Trigger button with provider avatar + model name + chevron
- `isOpen` state toggled on click
- Absolute-positioned dropdown (`bottom-full left-0 mb-2`) — opens upward
- Search input with auto-focus on open
- Models grouped by provider with `useMemo`
- Click-outside via `useEffect` + document `mousedown` listener
- Escape key via `useEffect` + document `keydown` listener
- Selection updates settings context + saves

### Current Manual Patterns to Delete

```tsx
// DELETE: click-outside listener
useEffect(() => {
  if (isOpen) {
    document.addEventListener('mousedown', handleClickOutside);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }
  return () => document.removeEventListener('mousedown', handleClickOutside);
}, [isOpen]);

// DELETE: escape key listener
useEffect(() => {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && isOpen) {
      setIsOpen(false);
      setSearchQuery('');
    }
  };
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [isOpen]);

// DELETE: containerRef for click-outside detection
const containerRef = useRef<HTMLDivElement>(null);
```

### New Structure

```tsx
import { Popover, PopoverTrigger, PopoverContent } from '@shared/ui';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@shared/ui';

export const ModelPicker: React.FC<ModelPickerProps> = ({ compact }) => {
  const [open, setOpen] = useState(false);
  const { settings, setSettings, saveSettings } = useSettings();

  // Keep existing memoized derivations
  const modelsByProvider = useMemo(() => /* ... */, [settings.providers]);
  const allModels = useMemo(() => /* ... */, [modelsByProvider]);
  const filteredModelsByProvider = useMemo(() => /* ... */, [modelsByProvider, searchQuery]);
  const selectedModel = useMemo(() => /* ... */, [allModels, settings]);

  const handleSelectModel = (model: ModelOption) => {
    setSettings(prev => ({
      ...prev,
      selectedProvider: model.provider,
      selectedModel: model.id,
    }));
    saveSettings();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={/* existing trigger styles */}
          disabled={allModels.length === 0}
          title="Change model"
        >
          {selectedModel && (
            <ProvidersAvatar provider={selectedModel.provider} size={compact ? 14 : 16} />
          )}
          <span className="truncate max-w-[200px]">
            {selectedModel?.name ?? 'Select model'}
          </span>
          <ChevronDown className={cn(
            'w-3 h-3 transition-transform',
            open && 'rotate-180'
          )} />
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        sideOffset={8}
        align="start"
        className="w-80 p-0"
      >
        <Command>
          <CommandInput placeholder="Search models..." />
          <CommandList className="max-h-80">
            <CommandEmpty>No models found</CommandEmpty>
            {Object.entries(filteredModelsByProvider).map(([provider, models]) => (
              <CommandGroup
                key={provider}
                heading={
                  <div className="flex items-center gap-2">
                    <ProvidersAvatar provider={provider} size={14} />
                    <span>{getProviderTitle(provider)}</span>
                  </div>
                }
              >
                {models.map((model) => (
                  <CommandItem
                    key={`${model.provider}-${model.id}`}
                    value={`${model.name} ${getProviderTitle(model.provider)}`}
                    onSelect={() => handleSelectModel(model)}
                  >
                    <span className="truncate flex-1">{model.name}</span>
                    {settings.selectedModel === model.id &&
                     settings.selectedProvider === model.provider && (
                      <Check className="w-4 h-4 shrink-0 text-[var(--text-muted)]" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
```

### Key Decisions

- **`side="top"`** — maintains the current upward-opening behavior. Radix will
  auto-flip to bottom if there's not enough space above.
- **`Command` inside `Popover`** — cmdk handles the search filtering
  automatically. The `value` prop on `CommandItem` is what gets matched
  against the search input. Include both model name and provider name so
  users can search by either.
- **Chevron rotation** — use the `open` state directly instead of a separate
  `isOpen` + CSS class.
- **Selection check mark** — same logic, just inside `CommandItem`.

### What Gets Deleted

- `containerRef` + click-outside `useEffect`
- Escape key `useEffect`
- `searchInputRef` + manual focus management
- `searchQuery` state (cmdk handles this internally)
- Manual filtering logic (cmdk does fuzzy matching)
- Absolute positioning classes on the dropdown div
- Manual `max-h-80 overflow-y-auto` on the list (Command handles scrolling)

### State Simplification

```
Before: isOpen, searchQuery, containerRef, searchInputRef + 2 useEffects
After:  open + 0 useEffects
```

---

## Step 5.2: Migrate MeetingMentionPopup

**File**: `src/features/chat/components/MeetingMentionPopup.tsx`
**Lines**: 183

### Current Implementation Summary

- Controlled `isOpen` prop from parent
- Search input with auto-focus
- Full keyboard navigation: ArrowUp, ArrowDown, Enter, Escape
- `highlightedIndex` state for keyboard selection
- Click-outside via `useEffect` + document `mousedown`
- Position prop for absolute positioning
- Meeting items with selection indicators + timestamps

### New Structure

```tsx
import { Popover, PopoverContent, PopoverAnchor } from '@shared/ui';
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from '@shared/ui';

interface MeetingMentionPopupProps {
  isOpen: boolean;
  meetings: MeetingListItem[];
  selectedIds: string[];
  onSelect: (id: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement>;
  // searchQuery and onSearchChange are now handled internally by Command
}

export const MeetingMentionPopup: React.FC<MeetingMentionPopupProps> = ({
  isOpen,
  meetings,
  selectedIds,
  onSelect,
  onClose,
  anchorRef,
}) => {
  return (
    <Popover open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverContent
        side="top"
        sideOffset={8}
        align="start"
        className="w-80 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()} // Let Command handle focus
      >
        <Command>
          <CommandInput placeholder="Search meetings..." />
          <CommandList className="max-h-80">
            <CommandEmpty>
              <div className="flex flex-col items-center gap-2 py-4">
                <FileAudio className="w-5 h-5 text-[var(--text-faint)]" />
                <span>No meetings found</span>
              </div>
            </CommandEmpty>
            {meetings.map((meeting) => (
              <CommandItem
                key={meeting.id}
                value={meeting.title}
                onSelect={() => onSelect(meeting.id)}
              >
                <FileAudio className="w-4 h-4 shrink-0 text-[var(--text-faint)]" />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm">{meeting.title}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {formatTime(meeting.timestamp)}
                  </div>
                </div>
                {selectedIds.includes(meeting.id) && (
                  <Check className="w-4 h-4 shrink-0 text-[var(--text-muted)]" />
                )}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
```

### Props Interface Change

The parent (`ChatInput` or wherever this is consumed) needs a minor update:

- **Remove**: `searchQuery`, `onSearchChange` props — Command handles search
  internally.
- **Add**: `anchorRef` — a ref to the chat input element so the popup anchors
  to it. Or use `PopoverAnchor` around the input in the parent.

If `PopoverAnchor` with `virtualRef` is complex, the simpler alternative is
to wrap the chat input's `@` trigger area with `PopoverAnchor`:

```tsx
// In parent (ChatInput):
<Popover open={mentionOpen} onOpenChange={setMentionOpen}>
  <PopoverAnchor asChild>
    <div>{/* chat input area */}</div>
  </PopoverAnchor>
  <MeetingMentionPopup ... />
</Popover>
```

And `MeetingMentionPopup` just returns a `PopoverContent`:

```tsx
export const MeetingMentionPopup = ({ meetings, selectedIds, onSelect }) => (
  <PopoverContent side="top" sideOffset={8} className="w-80 p-0">
    <Command>
      {/* ... */}
    </Command>
  </PopoverContent>
);
```

This is cleaner because the open/close state lives in the parent where the
`@` detection logic already runs.

### What Gets Deleted

- `highlightedIndex` state
- `containerRef` + click-outside `useEffect`
- `searchInputRef` + manual focus
- Full `handleKeyDown` callback (ArrowUp, ArrowDown, Enter, Escape)
- `searchQuery` / `onSearchChange` props and filtering logic
- Absolute positioning + manual viewport management

### State Simplification

```
Before: highlightedIndex, containerRef, searchInputRef, handleKeyDown callback
After:  (nothing — all handled by Command + Popover)
```

---

## Step 5.3: Important — Chat Input Keyboard Isolation

### The Risk

Both ModelPicker and MeetingMentionPopup are positioned near the chat input.
When a Radix Popover is open, it manages keyboard events (Arrow keys, Escape).
We must ensure these events don't leak to the chat input or interfere with
typing.

### Radix's Built-in Behavior

- When `PopoverContent` is focused, keyboard events are scoped to it.
- When the popover closes, focus returns to the trigger element.
- The chat input's own keyboard handlers (Enter to send, Shift+Enter for
  newline) are not affected because they fire on a different element.

### Testing Checklist

- [ ] With ModelPicker open: arrow keys navigate models, don't scroll chat
- [ ] With ModelPicker open: typing filters models, doesn't type into chat
- [ ] With ModelPicker closed: all chat input keyboard shortcuts work
- [ ] With MeetingMentionPopup open: arrow keys navigate meetings
- [ ] With MeetingMentionPopup open: typing filters meetings
- [ ] After closing either popup: focus returns to appropriate element
- [ ] Escape closes popup without triggering other escape handlers

---

## Verification

- [ ] ModelPicker: Opens on click, shows grouped models, search works,
      selection updates settings, close on select/escape/click-outside
- [ ] ModelPicker: Compact mode still works
- [ ] ModelPicker: Disabled state (no models) still works
- [ ] MeetingMentionPopup: Opens on @ trigger, shows meetings, search works,
      selection toggles correctly, close on escape/click-outside
- [ ] MeetingMentionPopup: Selected meetings show check marks
- [ ] No keyboard conflicts with chat input
- [ ] No z-index conflicts with other overlays
- [ ] Dark mode works
- [ ] `npm run build` succeeds
