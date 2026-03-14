# Phase 6: Search Overlay Migration

**Goal**: Replace the hand-rolled `SearchOverlay` component (Cmd+K palette)
with the `CommandDialog` composite built in Phase 2. This is the most natural
fit for cmdk — it was literally designed for this pattern.

**Risk**: Low. SearchOverlay is self-contained with no dependencies on other
migrated components. It reads from `useUnifiedSidebar` for data and navigates
via `useApp` / `useChat` contexts.

**Prerequisite**: Phase 2 complete (CommandDialog primitive exists).

---

## Current Implementation

**File**: `src/shared/components/SearchOverlay.tsx`
**Lines**: 196

### Structure

```
Fixed backdrop (inset-0, z-[100], bg-black/40, backdrop-blur-sm)
  └── Centered container (max-w-lg, top-padded at 20vh)
        ├── Search input (with ESC keyboard hint)
        ├── Results list (max-h-300px, overflow-y-auto)
        │     ├── Meeting items (AudioWaveform icon + title + timestamp)
        │     └── Chat items (MessageSquare icon + title + preview)
        └── Footer hint ("Type to search...")
```

### Manual Patterns

- `query` state for search text
- `selectedIndex` state for keyboard navigation
- `inputRef` for auto-focus on open
- `listRef` for scroll-into-view management
- `handleKeyDown` callback: Escape, ArrowDown, ArrowUp, Enter
- Click-outside on backdrop to close
- Manual `scrollIntoView({ block: 'nearest' })` on selection change
- Max 10 visible results (sliced from `filteredItems`)

### Data Flow

1. `useUnifiedSidebar()` provides all sidebar items (meetings + chats)
2. Items are filtered by `query` (case-insensitive includes on title)
3. On select: navigate to the item via `useApp().setCurrentView()` and
   `useChat().selectSession()` or similar

---

## New Implementation

```tsx
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@shared/ui';

interface SearchOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({ open, onOpenChange }) => {
  const { items } = useUnifiedSidebar();
  const { setCurrentView } = useApp();
  const { selectSession } = useChat();

  // Separate meetings and chats for grouped display
  const meetings = items.filter((i) => i.type === 'meeting');
  const chats = items.filter((i) => i.type === 'chat');

  const handleSelect = (item: SidebarItem) => {
    if (item.type === 'meeting') {
      setCurrentView('meeting', item.id);
    } else {
      selectSession(item.id);
      setCurrentView('chat');
    }
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search meetings and conversations..." />
      <CommandList>
        <CommandEmpty>
          <div className="flex flex-col items-center gap-2 py-8">
            <Search className="w-5 h-5 text-[var(--text-faint)]" />
            <span className="text-sm text-[var(--text-muted)]">No results found</span>
          </div>
        </CommandEmpty>

        {meetings.length > 0 && (
          <CommandGroup heading="Meetings">
            {meetings.map((item) => (
              <CommandItem
                key={item.id}
                value={item.title}
                onSelect={() => handleSelect(item)}
              >
                <AudioWaveform className="w-4 h-4 shrink-0 text-[var(--text-faint)]" />
                <div className="flex-1 min-w-0">
                  <span className="truncate">{item.title}</span>
                </div>
                {item.timestamp && (
                  <span className="text-xs text-[var(--text-muted)] shrink-0">
                    {formatRelativeTime(item.timestamp)}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {meetings.length > 0 && chats.length > 0 && <CommandSeparator />}

        {chats.length > 0 && (
          <CommandGroup heading="Conversations">
            {chats.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.title} ${item.preview ?? ''}`}
                onSelect={() => handleSelect(item)}
              >
                <MessageSquare className="w-4 h-4 shrink-0 text-[var(--text-faint)]" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{item.title}</div>
                  {item.preview && (
                    <div className="truncate text-xs text-[var(--text-muted)]">
                      {item.preview}
                    </div>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>

      {/* Footer */}
      <div className={`flex items-center justify-between px-3 py-2 border-t border-[var(--border-default)] text-xs text-[var(--text-faint)]`}>
        <span>Type to search</span>
        <kbd className="px-1.5 py-0.5 bg-[var(--surface-input)] rounded text-[10px] font-mono">
          ESC
        </kbd>
      </div>
    </CommandDialog>
  );
};
```

---

## CommandDialog Positioning

The `CommandDialog` composite (from Phase 2) renders as:

```
Dialog (portal)
  └── DialogOverlay (backdrop, z-50)
  └── DialogContent (positioned at top-[20vh], not centered)
        └── Command
```

The key override on `DialogContent` for the command palette:
```css
/* Override Dialog's default centering for command palette */
top-[20vh] translate-y-0 left-1/2 -translate-x-1/2
```

This matches the current SearchOverlay's `pt-[20vh]` positioning — the
palette appears in the upper portion of the screen, not dead center.

---

## Consumer Changes

**In `App.tsx`** (or wherever the search keybinding lives):

### Before

```tsx
<SearchOverlay isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
```

### After

```tsx
<SearchOverlay
  open={isSearchOpen}
  onOpenChange={setIsSearchOpen}
/>
```

The Cmd+K keybinding that sets `isSearchOpen = true` stays unchanged.
`CommandDialog` handles Escape to close automatically.

---

## What Gets Deleted

| Pattern | Lines Saved |
|---|---|
| `query` state | 1 |
| `selectedIndex` state | 1 |
| `inputRef` + auto-focus useEffect | ~5 |
| `listRef` + scroll-into-view useEffect | ~8 |
| `handleKeyDown` callback (Escape, Arrow, Enter) | ~20 |
| Click-outside backdrop handler | ~3 |
| Fixed backdrop + centering div | ~5 |
| Manual result slicing (max 10) | ~3 |
| **Total** | **~46 lines** |

cmdk replaces all of this with built-in behavior:
- Search filtering (fuzzy, automatic)
- Keyboard navigation (Arrow keys, Enter, Escape)
- Auto-focus on input when dialog opens
- Scroll management for selected items
- Empty state handling

---

## Enhancement Opportunities (optional, future)

These are NOT part of the migration — do them only if desired later:

1. **Keyboard shortcut hints** — cmdk supports `keywords` prop on items
   for alias matching (e.g., "meeting" matches "recording")
2. **Recent items** — show recently accessed items when search is empty
3. **Actions** — add action items like "New Chat", "Start Recording",
   "Open Settings" to the command palette
4. **Sections by recency** — "Today", "This Week", "Older"

---

## Verification

- [ ] Cmd+K opens the search overlay
- [ ] Typing filters results (meetings and chats)
- [ ] Arrow keys navigate results
- [ ] Enter selects the highlighted result and navigates to it
- [ ] Escape closes the overlay
- [ ] Click outside closes the overlay
- [ ] Results are grouped (Meetings / Conversations)
- [ ] Empty state shows when no results match
- [ ] ESC keyboard hint shows in footer
- [ ] Overlay positioned at top-20vh (not centered)
- [ ] Dark mode works
- [ ] Focus returns to previous element after close
- [ ] `npm run build` succeeds
