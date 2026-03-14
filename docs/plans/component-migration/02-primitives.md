# Phase 2: Build Shared UI Primitives

**Goal**: Create 7 thin wrapper components in `src/shared/ui/` around Radix
primitives, styled with existing theme tokens. These are the building blocks
that Phases 3–6 consume.

**Risk**: None. These are new files with no consumers yet. The app is
unchanged until Phase 3 starts using them.

**Prerequisite**: Phase 1 complete (packages installed, CSS variables defined).

---

## Design Approach

Each primitive follows the same pattern:

1. **Import Radix primitive** (e.g., `@radix-ui/react-dialog`)
2. **Re-export sub-components** with default styling from theme tokens
3. **Use `forwardRef`** on every component for composition
4. **Accept `className` override** on every component — consumers can extend
5. **Apply animations** via `data-[state=open]` / `data-[state=closed]` Tailwind selectors
6. **No business logic** — these are pure presentation wrappers

Utility helper for merging classNames (add to `src/shared/ui/utils.ts`):

```ts
// src/shared/ui/utils.ts
// Minimal className merge — concatenates truthy strings.
// No clsx/tailwind-merge dependency needed for our use case
// since we control both sides (wrapper defaults + consumer overrides).
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
```

---

## Primitive 2.1: Dialog

**File**: `src/shared/ui/dialog.tsx`
**Radix package**: `@radix-ui/react-dialog`
**Replaces**: Hand-rolled modals (fixed inset-0 + backdrop + stopPropagation)

### Exported Components

| Export | Radix Part | Purpose |
|---|---|---|
| `Dialog` | `Dialog.Root` | State controller (open/onOpenChange) |
| `DialogTrigger` | `Dialog.Trigger` | Button that opens the dialog |
| `DialogPortal` | `Dialog.Portal` | Portals content to document.body |
| `DialogOverlay` | `Dialog.Overlay` | Fullscreen backdrop |
| `DialogContent` | `Dialog.Content` | Centered modal panel |
| `DialogHeader` | `<div>` | Flex row for title + close button |
| `DialogTitle` | `Dialog.Title` | Accessible title (required by Radix) |
| `DialogDescription` | `Dialog.Description` | Optional description |
| `DialogFooter` | `<div>` | Button row at bottom |
| `DialogClose` | `Dialog.Close` | Close trigger (wraps any child) |

### Default Styling

```
DialogOverlay:
  fixed inset-0 z-50
  bg-[var(--surface-overlay)] backdrop-blur-sm
  data-[state=open]:animate-overlay-show
  data-[state=closed]:animate-overlay-hide

DialogContent:
  fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50
  w-full max-w-lg
  bg-[var(--surface-modal)]
  border border-[var(--border-strong)]
  rounded-[var(--radius-xl)]
  shadow-[var(--shadow-modal)]
  p-6
  data-[state=open]:animate-content-show
  data-[state=closed]:animate-content-hide
  focus:outline-none

DialogHeader:
  flex items-center justify-between mb-4

DialogTitle:
  text-lg font-semibold text-[var(--text-primary)]

DialogDescription:
  text-sm text-[var(--text-secondary)] mt-1

DialogFooter:
  flex items-center justify-end gap-3 mt-6
```

### Implementation Notes

- `DialogOverlay` and `DialogContent` must both be inside `DialogPortal`.
- Radix handles focus trapping, Escape key, and click-outside automatically.
  Delete all manual `useEffect` listeners when migrating consumers.
- `DialogTitle` is required for accessibility. If a dialog has no visible
  title, use `<VisuallyHidden asChild><DialogTitle>...</DialogTitle></VisuallyHidden>`
  (import from `@radix-ui/react-visually-hidden` if needed, or just add
  `sr-only` class).

---

## Primitive 2.2: AlertDialog

**File**: `src/shared/ui/alert-dialog.tsx`
**Radix package**: `@radix-ui/react-alert-dialog`
**Replaces**: Confirmation modals (UnsavedChangesModal, DeleteConfirmModal)

### Exported Components

| Export | Radix Part | Purpose |
|---|---|---|
| `AlertDialog` | `AlertDialog.Root` | State controller |
| `AlertDialogTrigger` | `AlertDialog.Trigger` | Optional trigger |
| `AlertDialogPortal` | `AlertDialog.Portal` | Portal to body |
| `AlertDialogOverlay` | `AlertDialog.Overlay` | Backdrop |
| `AlertDialogContent` | `AlertDialog.Content` | Modal panel |
| `AlertDialogTitle` | `AlertDialog.Title` | Title (required) |
| `AlertDialogDescription` | `AlertDialog.Description` | Body text |
| `AlertDialogAction` | `AlertDialog.Action` | Confirm button |
| `AlertDialogCancel` | `AlertDialog.Cancel` | Cancel button |

### Default Styling

Same as Dialog for Overlay and Content. Key difference:

- `AlertDialogContent` uses `max-w-md` (smaller than Dialog's `max-w-lg`)
- AlertDialog does NOT close on click-outside (Radix default for alert
  dialogs — this is correct behavior for destructive confirmations)

### Why AlertDialog vs Dialog?

AlertDialog differs from Dialog in two critical ways:
1. **No click-outside dismiss** — prevents accidental data loss
2. **Requires explicit action** — screen readers announce it as an alert
3. **Escape closes** — but only triggers the Cancel action, not silent dismiss

Use AlertDialog for: delete confirmations, unsaved changes warnings, consent
modals. Use Dialog for: info panels, forms, non-destructive content.

---

## Primitive 2.3: Select

**File**: `src/shared/ui/select.tsx`
**Radix package**: `@radix-ui/react-select`
**Replaces**: Native `<select>` elements, custom dropdown selects

### Exported Components

| Export | Radix Part | Purpose |
|---|---|---|
| `Select` | `Select.Root` | State controller (value/onValueChange) |
| `SelectTrigger` | `Select.Trigger` | Styled trigger button |
| `SelectValue` | `Select.Value` | Display of selected value |
| `SelectContent` | `Select.Content` | Dropdown panel |
| `SelectViewport` | `Select.Viewport` | Scrollable viewport |
| `SelectItem` | `Select.Item` | Individual option |
| `SelectGroup` | `Select.Group` | Group of options |
| `SelectLabel` | `Select.Label` | Group label |
| `SelectSeparator` | `Select.Separator` | Visual divider |
| `SelectScrollUpButton` | `Select.ScrollUpButton` | Top scroll indicator |
| `SelectScrollDownButton` | `Select.ScrollDownButton` | Bottom scroll indicator |

### Default Styling

```
SelectTrigger:
  flex items-center justify-between
  w-full px-3 py-2.5
  bg-[var(--surface-input-field)]
  border border-[var(--border-input)]
  rounded-[var(--radius-md)]
  text-sm text-[var(--text-primary)]
  focus:ring-2 focus:ring-[var(--border-ring)]
  transition-all
  data-[placeholder]:text-[var(--text-faint)]
  [ChevronDown icon, 4x4, text-muted, right side]

SelectContent:
  overflow-hidden
  bg-[var(--surface-dropdown)]
  border border-[var(--border-strong)]
  rounded-[var(--radius-md)]
  shadow-[var(--shadow-float)]
  z-50
  data-[state=open]:animate-select-content-show
  data-[state=closed]:animate-select-content-hide
  position: popper (auto-positions to avoid viewport overflow)

SelectItem:
  relative flex items-center
  px-3 py-2
  text-sm text-[var(--text-primary)]
  rounded-sm
  cursor-default select-none
  data-[highlighted]:bg-[var(--surface-hover-subtle)]
  data-[highlighted]:text-[var(--text-primary)]
  data-[disabled]:opacity-50

SelectLabel:
  px-3 py-1.5
  text-xs font-medium text-[var(--text-faint)]

SelectSeparator:
  h-px my-1 bg-[var(--border-default)]
```

### Implementation Notes

- Use `position="popper"` on `SelectContent` so it positions relative to
  trigger (like native select) rather than as a detached popover.
- `SelectScrollUpButton` / `SelectScrollDownButton` show chevron indicators
  when list is scrollable — add `flex items-center justify-center h-6`.
- For rich content in items (icons, avatars, badges), just put them as
  children of `SelectItem` — Radix handles it. The `SelectItemText` sub-part
  is what gets announced to screen readers.

---

## Primitive 2.4: Popover

**File**: `src/shared/ui/popover.tsx`
**Radix package**: `@radix-ui/react-popover`
**Replaces**: Custom dropdowns with search (ModelPicker, MeetingMentionPopup)

### Exported Components

| Export | Radix Part | Purpose |
|---|---|---|
| `Popover` | `Popover.Root` | State controller |
| `PopoverTrigger` | `Popover.Trigger` | Trigger element |
| `PopoverContent` | `Popover.Content` | Floating panel |
| `PopoverAnchor` | `Popover.Anchor` | Anchor without trigger behavior |
| `PopoverClose` | `Popover.Close` | Close button |

### Default Styling

```
PopoverContent:
  z-50 w-72
  bg-[var(--surface-dropdown)]
  border border-[var(--border-strong)]
  rounded-[var(--radius-lg)]
  shadow-[var(--shadow-float)]
  p-0
  data-[state=open]:animate-content-show
  data-[state=closed]:animate-content-hide
  outline-none
```

### Implementation Notes

- `PopoverContent` accepts `side`, `sideOffset`, `align`, `alignOffset` for
  positioning. The current ModelPicker uses `bottom-full mb-2` (above trigger).
  Equivalent: `side="top" sideOffset={8}`.
- Radix handles viewport collision detection automatically. If the popover
  would overflow, it flips to the other side. This replaces the manual
  `dropdownAbove` boolean in ProvidersPanel.
- Click-outside and Escape are handled automatically.

---

## Primitive 2.5: Command (cmdk)

**File**: `src/shared/ui/command.tsx`
**Package**: `cmdk` (not Radix, but designed to pair with it)
**Replaces**: SearchOverlay (Cmd+K palette), and can also be used inside
Popovers for searchable dropdowns (ModelPicker, MeetingMentionPopup).

### Exported Components

| Export | cmdk Part | Purpose |
|---|---|---|
| `Command` | `Command` | Root command container |
| `CommandInput` | `Command.Input` | Search input with built-in filtering |
| `CommandList` | `Command.List` | Results list |
| `CommandEmpty` | `Command.Empty` | Empty state |
| `CommandGroup` | `Command.Group` | Grouped results |
| `CommandItem` | `Command.Item` | Individual result |
| `CommandSeparator` | `Command.Separator` | Visual divider |
| `CommandDialog` | Custom | Command inside a Dialog (for Cmd+K) |

### Default Styling

```
Command:
  flex flex-col
  overflow-hidden
  bg-[var(--surface-modal)]
  rounded-[var(--radius-lg)]
  text-[var(--text-primary)]

CommandInput:
  flex w-full
  px-3 py-3
  text-sm
  bg-transparent
  border-b border-[var(--border-default)]
  text-[var(--text-primary)]
  placeholder:text-[var(--text-faint)]
  outline-none

CommandList:
  max-h-[300px] overflow-y-auto custom-scrollbar
  p-1

CommandEmpty:
  py-6 text-center text-sm text-[var(--text-muted)]

CommandGroup heading:
  px-2 py-1.5
  text-xs font-medium text-[var(--text-faint)]

CommandItem:
  relative flex items-center gap-2
  px-2 py-2
  text-sm
  rounded-[var(--radius-md)]
  cursor-default select-none
  data-[selected=true]:bg-[var(--surface-selected)]
  text-[var(--text-primary)]

CommandSeparator:
  h-px my-1 bg-[var(--border-default)]
```

### CommandDialog (Composite)

`CommandDialog` wraps `Command` inside a `Dialog` for the Cmd+K overlay:

```tsx
export function CommandDialog({ open, onOpenChange, children }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent className="p-0 overflow-hidden max-w-lg top-[20vh] translate-y-0">
          <Command>{children}</Command>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
```

This replaces the current `SearchOverlay`'s manual fixed+flex+backdrop.

### Implementation Notes

- cmdk provides built-in fuzzy filtering via its `filter` prop. This
  replaces the manual `searchQuery.toLowerCase().includes()` filtering in
  ModelPicker and MeetingMentionPopup.
- Arrow key navigation, Enter to select, and Escape to close are built-in.
- The `Command` component can be used standalone (inside a Popover for
  searchable dropdowns) or inside `CommandDialog` (for the global search).

---

## Primitive 2.6: DropdownMenu

**File**: `src/shared/ui/dropdown-menu.tsx`
**Radix package**: `@radix-ui/react-dropdown-menu`
**Replaces**: Context menus and action menus (sidebar item menus, etc.)

### Exported Components

| Export | Radix Part | Purpose |
|---|---|---|
| `DropdownMenu` | `DropdownMenu.Root` | State controller |
| `DropdownMenuTrigger` | `DropdownMenu.Trigger` | Trigger button |
| `DropdownMenuContent` | `DropdownMenu.Content` | Floating menu |
| `DropdownMenuItem` | `DropdownMenu.Item` | Menu item |
| `DropdownMenuSeparator` | `DropdownMenu.Separator` | Divider |
| `DropdownMenuLabel` | `DropdownMenu.Label` | Section label |

### Default Styling

```
DropdownMenuContent:
  z-50 min-w-[180px]
  bg-[var(--surface-dropdown)]
  border border-[var(--border-strong)]
  rounded-[var(--radius-md)]
  shadow-[var(--shadow-float)]
  p-1
  data-[state=open]:animate-content-show
  data-[state=closed]:animate-content-hide

DropdownMenuItem:
  relative flex items-center gap-2
  px-2 py-2
  text-sm rounded-sm
  cursor-default select-none
  text-[var(--text-primary)]
  data-[highlighted]:bg-[var(--surface-hover-subtle)]
  outline-none
  transition-colors

DropdownMenuSeparator:
  h-px my-1 bg-[var(--border-default)]

DropdownMenuLabel:
  px-2 py-1.5
  text-xs font-medium text-[var(--text-faint)]
```

---

## Primitive 2.7: Switch

**File**: `src/shared/ui/switch.tsx`
**Radix package**: `@radix-ui/react-switch`
**Replaces**: Custom `Toggle` component in settings

### Exported Component

Single export: `Switch`

### Default Styling

```
Switch (root):
  peer inline-flex shrink-0 cursor-pointer
  h-5 w-9
  rounded-full border-2 border-transparent
  transition-colors
  bg-[var(--switch-inactive)]
  data-[state=checked]:bg-[var(--switch-active)]
  disabled:opacity-50 disabled:cursor-not-allowed
  focus-visible:ring-2 focus-visible:ring-[var(--border-ring)]

Switch thumb:
  pointer-events-none block
  h-4 w-4
  rounded-full
  bg-[var(--switch-thumb)]
  shadow-sm
  transition-transform
  data-[state=checked]:translate-x-4
  data-[state=unchecked]:translate-x-0
```

### Props Compatibility

Current `Toggle` props:
```ts
{ checked, onChange, size?, disabled?, label? }
```

Radix `Switch` props:
```ts
{ checked, onCheckedChange, disabled?, ...HTMLButtonProps }
```

The wrapper will accept both `onChange` (legacy) and `onCheckedChange`
(Radix-native) to enable gradual migration. The `label` prop can be handled
by the consumer wrapping `Switch` in a `<label>` or using Radix's `Label`
primitive.

Size variants (`sm` and `md`) will be supported via a `size` prop that
adjusts the dimensions:

- `sm`: track `h-3.5 w-6`, thumb `h-2.5 w-2.5`, translate `translate-x-2.5`
- `md` (default): track `h-5 w-9`, thumb `h-4 w-4`, translate `translate-x-4`

---

## Barrel Export

After all 7 primitives are built, update `src/shared/ui/index.ts`:

```ts
export * from './dialog';
export * from './alert-dialog';
export * from './select';
export * from './popover';
export * from './command';
export * from './dropdown-menu';
export * from './switch';
export { cn } from './utils';
```

---

## Verification

- [ ] Each primitive file imports cleanly from its Radix package
- [ ] `npm run build` succeeds with no TypeScript errors
- [ ] Each component can be rendered in isolation (create a temp test page)
- [ ] No existing components are affected — these are new files only
- [ ] Theme tokens (light/dark) apply correctly via CSS variables
- [ ] Animations play on open/close state transitions
- [ ] Keyboard navigation works on each primitive (Tab, Escape, Arrow, Enter)
