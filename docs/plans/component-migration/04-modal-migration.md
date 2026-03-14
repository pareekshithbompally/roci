# Phase 4: Modal Migration

**Goal**: Migrate 4 hand-rolled modals to Radix `Dialog` and `AlertDialog`
primitives. Delete all manual backdrop, click-outside, and focus management
code.

**Risk**: Medium. Modals are global overlays — a broken modal can block the
entire UI. Test each migration individually before moving to the next.

**Prerequisite**: Phase 2 complete (Dialog and AlertDialog primitives exist).

---

## Migration Map

| Modal | Current Location | Radix Primitive | Reason |
|---|---|---|---|
| DeleteConfirmModal | `src/features/history/components/` | **AlertDialog** | Destructive confirmation — should not close on click-outside |
| UnsavedChangesModal | `src/shared/components/` | **AlertDialog** | Destructive confirmation — same rationale |
| ModelDownloadModal | `src/shared/components/` | **AlertDialog** | Consent-gated — user must explicitly accept or decline |
| RecordingViewModal | `src/features/recording/components/` | **Dialog** | Non-destructive info panel — can close freely |

---

## Step 4.1: Migrate DeleteConfirmModal

**File**: `src/features/history/components/DeleteConfirmModal.tsx`
**Lines**: 61

### Current Structure

```tsx
// Props: { onCancel, onConfirm }
<div className="fixed inset-0 z-50 ...">           {/* backdrop */}
  <div onClick={onCancel}>                          {/* click-outside */}
    <div onClick={e.stopPropagation()}>             {/* modal body */}
      <AlertTriangle />
      <h3>Delete Session?</h3>
      <p>This will permanently delete...</p>
      <button onClick={onCancel}>Cancel</button>
      <button onClick={onConfirm}>Delete Session</button>
    </div>
  </div>
</div>
```

### New Structure

```tsx
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@shared/ui';

interface DeleteConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  open,
  onOpenChange,
  onConfirm,
}) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogContent>
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <AlertDialogTitle>Delete Session?</AlertDialogTitle>
        </div>
        <AlertDialogDescription>
          This will permanently delete this session and all its data.
          This action cannot be undone.
        </AlertDialogDescription>
        <div className="flex items-center justify-end gap-3 mt-6">
          <AlertDialogCancel asChild>
            <button className={`${SPACING.button} ${COMPONENT.secondaryButton} ${RADIUS.md}`}>
              Cancel
            </button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <button
              onClick={onConfirm}
              className={`${SPACING.button} ${COMPONENT.dangerButton} ${RADIUS.md}`}
            >
              Delete Session
            </button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialog>
);
```

### Consumer Changes

**In `App.tsx`** (or wherever `DeleteConfirmModal` is rendered):

```tsx
// Before:
{history.deleteConfirmId && <DeleteConfirmModal onCancel={...} onConfirm={...} />}

// After:
<DeleteConfirmModal
  open={!!history.deleteConfirmId}
  onOpenChange={(open) => { if (!open) history.cancelDelete(); }}
  onConfirm={history.confirmDelete}
/>
```

The `AlertDialog` is always mounted but only visible when `open={true}`.
This is the Radix controlled pattern.

### What Gets Deleted

- Fixed positioning div (Radix handles via Portal)
- `onClick` backdrop handler (Radix AlertDialog blocks click-outside by design)
- `e.stopPropagation()` on modal body
- `animate-fade-in` class (replaced by `data-[state=open]:animate-content-show`)

---

## Step 4.2: Migrate UnsavedChangesModal

**File**: `src/shared/components/UnsavedChangesModal.tsx`
**Lines**: 76

### Current Structure

- Reads `showWarningModal` from `UnsavedChangesContext`
- Two actions: `cancelNavigation()` and `confirmNavigation()`
- Fixed backdrop with click-outside → cancel

### New Structure

```tsx
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@shared/ui';
import { useUnsavedChanges } from '@shared/contexts/UnsavedChangesContext';

export const UnsavedChangesModal: React.FC = () => {
  const { showWarningModal, cancelNavigation, confirmNavigation } = useUnsavedChanges();

  return (
    <AlertDialog
      open={showWarningModal}
      onOpenChange={(open) => { if (!open) cancelNavigation(); }}
    >
      <AlertDialogPortal>
        <AlertDialogOverlay />
        <AlertDialogContent>
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            You have unsaved changes. Are you sure you want to leave?
            Your changes will be lost.
          </AlertDialogDescription>
          <div className="flex items-center justify-end gap-3 mt-6">
            <AlertDialogCancel asChild>
              <button className={`${SPACING.button} ${COMPONENT.secondaryButton} ${RADIUS.md}`}>
                Stay on Page
              </button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <button
                onClick={confirmNavigation}
                className={`${SPACING.button} ${COMPONENT.dangerButton} ${RADIUS.md}`}
              >
                Discard Changes
              </button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialog>
  );
};
```

### What Gets Deleted

- Close (X) button in top-right (AlertDialog uses Cancel/Action pattern)
- Fixed backdrop div
- Manual `onClick` handlers on backdrop

---

## Step 4.3: Migrate ModelDownloadModal

**File**: `src/shared/components/ModelDownloadModal.tsx`
**Lines**: 265

### Complexity Note

This is the most complex modal. It has:
1. A subscription-driven visibility model (`onConsentNeeded` event)
2. A resolver pattern (Promise-based accept/decline)
3. Debounced toast logic for download progress
4. Multiple UI states

### Migration Strategy

**Only migrate the modal chrome** — the consent UI and the resolver pattern.
Do NOT touch the toast/progress logic (it uses `sonner` and works fine).

The key insight: this modal's `visible` state is controlled internally via
event subscription, not by a parent. This maps to Radix's controlled dialog:

```tsx
<AlertDialog
  open={visible}
  onOpenChange={(open) => { if (!open) handleDecline(); }}
>
```

### New Structure (skeleton — preserve all existing business logic)

```tsx
export const ModelDownloadModal: React.FC = () => {
  // ... existing state: visible, resolver, visibleRef ...
  // ... existing useEffect subscriptions (onConsentNeeded, onEmbeddingProgress) ...
  // ... existing handleAccept, handleDecline ...
  // ... existing toast logic — UNCHANGED ...

  return (
    <AlertDialog
      open={visible}
      onOpenChange={(open) => { if (!open) handleDecline(); }}
    >
      <AlertDialogPortal>
        <AlertDialogOverlay />
        <AlertDialogContent className="max-w-md">
          {/* Close button (top-right) */}
          <AlertDialogCancel asChild>
            <button className={`absolute top-4 right-4 ${COMPONENT.iconButtonSm}`}>
              <X className="w-4 h-4" />
            </button>
          </AlertDialogCancel>

          {/* Icon + Title */}
          <div className="flex flex-col items-center gap-3 mb-4">
            <div className={`p-3 ${SURFACE.infoCallout} ${RADIUS.lg}`}>
              <Brain className={`w-6 h-6 ${TEXT.link}`} />
            </div>
            <AlertDialogTitle className="text-center">
              Download Embedding Model
            </AlertDialogTitle>
          </div>

          {/* Description */}
          <AlertDialogDescription className="text-center">
            {/* ... existing description text ... */}
          </AlertDialogDescription>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-6">
            <AlertDialogCancel asChild>
              <button className={`flex-1 ${SPACING.buttonLg} ${COMPONENT.secondaryButton} ${RADIUS.md}`}>
                Not Now
              </button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <button
                onClick={handleAccept}
                className={`flex-1 ${SPACING.buttonLg} ${COMPONENT.accentButton} ${RADIUS.md}`}
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialog>
  );
};
```

### What Gets Deleted

- Fixed backdrop div + `animate-fade-in`
- `onClick` on backdrop → `handleDecline`
- `e.stopPropagation()` on modal body
- Manual z-50 positioning

### What Stays Unchanged

- All `useEffect` subscriptions (`onConsentNeeded`, `onEmbeddingProgress`)
- Resolver pattern (`setResolver`, `handleAccept`, `handleDecline`)
- Toast logic (debouncing, phases, `sonner` calls)
- `visibleRef` sync pattern

---

## Step 4.4: Migrate RecordingViewModal

**File**: `src/features/recording/components/RecordingViewModal.tsx`
**Lines**: 92

### Current Structure

- Full-screen modal at `z-[100]`
- Minimize button (not close — this modal can't be dismissed, only minimized)
- Pause/Resume/Stop controls
- No backdrop click dismiss

### New Structure

```tsx
import { Dialog, DialogPortal, DialogOverlay, DialogContent, DialogTitle } from '@shared/ui';

interface RecordingViewModalProps {
  open: boolean;
  onMinimize: () => void;
}

export const RecordingViewModal: React.FC<RecordingViewModalProps> = ({
  open,
  onMinimize,
}) => {
  const { isPaused, elapsedTime, audioSource, pauseRecording, resumeRecording, stopRecording } =
    useRecordingContext();

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) onMinimize(); }}
    >
      <DialogPortal>
        <DialogOverlay className="z-[100]" />
        <DialogContent
          className="z-[100] max-w-sm text-center"
          // Prevent Escape from fully closing — minimize instead
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            onMinimize();
          }}
          // Prevent click-outside from closing — minimize instead
          onPointerDownOutside={(e) => {
            e.preventDefault();
            onMinimize();
          }}
        >
          {/* Hide DialogTitle for accessibility but don't show it */}
          <DialogTitle className="sr-only">Recording in Progress</DialogTitle>

          {/* Minimize button */}
          <button
            onClick={onMinimize}
            className={`absolute top-4 right-4 ${COMPONENT.iconButton}`}
            title="Minimize"
          >
            <Minimize2 className="w-5 h-5" />
          </button>

          {/* Timer, controls — existing JSX unchanged */}
          {/* ... */}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};
```

### Key Decisions

- **Escape → minimize** (not close). Use `onEscapeKeyDown` with
  `preventDefault()` to intercept and call `onMinimize` instead.
- **Click-outside → minimize**. Use `onPointerDownOutside` with
  `preventDefault()` and call `onMinimize`.
- **z-[100]** preserved on both overlay and content to match current stacking.
- `DialogTitle` with `sr-only` for accessibility (screen readers need it).
- Timer display, pause/resume/stop buttons — JSX stays identical.

---

## Step 4.5: Update App.tsx Modal Rendering

After migrating all modals, update `App.tsx` to use the controlled `open` prop
pattern instead of conditional rendering:

### Before

```tsx
{history.deleteConfirmId && <DeleteConfirmModal onCancel={...} onConfirm={...} />}
{chat.deleteConfirmId && <DeleteConfirmModal onCancel={...} onConfirm={...} />}
```

### After

```tsx
<DeleteConfirmModal
  open={!!history.deleteConfirmId}
  onOpenChange={(open) => { if (!open) history.cancelDelete(); }}
  onConfirm={() => history.confirmDelete()}
/>
<DeleteConfirmModal
  open={!!chat.deleteConfirmId}
  onOpenChange={(open) => { if (!open) chat.cancelDelete(); }}
  onConfirm={() => chat.confirmDelete()}
/>
```

The modals are always mounted but invisible. Radix manages the show/hide
lifecycle including animation, portal rendering, and cleanup.

---

## Verification

- [ ] DeleteConfirmModal: Opens on delete click, Cancel closes, Delete triggers
      action, Escape triggers cancel, click-outside does NOT close (AlertDialog)
- [ ] UnsavedChangesModal: Opens on unsaved navigation, "Stay" cancels,
      "Discard" confirms, Escape triggers cancel
- [ ] ModelDownloadModal: Opens on consent event, Accept resolves true,
      Decline resolves false, toast progress still works after accept
- [ ] RecordingViewModal: Opens when recording starts, Minimize button works,
      Escape minimizes (not close), controls functional
- [ ] No z-index conflicts between modals
- [ ] Focus is trapped inside open modals (Tab doesn't escape)
- [ ] Animations play smoothly (fade-in on open, fade-out on close)
- [ ] Dark mode works on all modals
- [ ] `npm run build` succeeds
