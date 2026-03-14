# Plan: Unified Toast Consistency with Sonner (AUDITED)

## Overview
This plan has been audited to ensure 100% coverage of all notification surfaces. The goal is to move from a fragmented notification landscape to a unified, context-driven Sonner system with consistent branding, icons, and behavior.

## Core Mandates
1. **Rich Colors**: Always use `richColors` (Green/Red/Blue/Amber) for high-signal feedback.
2. **Standardized Icons**:
   - **Success**: `CheckCircle2` (Lucide)
   - **Error**: `XCircle` (Lucide)
   - **Info**: `Info` (Lucide)
   - **Warning**: `AlertTriangle` (Lucide)
3. **Context-Only API**: All components must use `useToast().showToast()` instead of importing `sonner` directly. This allows the context to act as a single point of truth for styling.

## Implementation Details

### Phase 1: Global Configuration & Centralization
- **File: `src/App.tsx`**
  - Update `<Toaster />` to ensure it respects the app's theme (`isDark` from `ThemeContext`) explicitly rather than just `system`.
  - Verify `richColors` and `closeButton` are enabled.
- **File: `src/shared/contexts/ToastContext.tsx`**
  - **Logic Upgrade**: Modify `showToast` to accept Lucide icons as options.
  - **Defaulting**: Set default icons for each `ToastType` (`success` -> check, `error` -> cross, `info` -> info icon).
  - This ensures that *any* call to `showToast` automatically gets the correct color AND the correct icon.

### Phase 2: Migration of Direct Sonner Calls (High Priority)
The following files currently bypass the `ToastContext` and must be refactored to use `useToast()`:
- **File: `src/features/recording/context/RecordingContext.tsx`**
  - Replace `sonnerToast.success('Recording deleted')` with `showToast('Recording deleted', 'success')`.
  - Replace all error/info/success calls.
- **File: `src/shared/components/ModelDownloadModal.tsx`**
  - Replace `sonnerToast.loading`, `sonnerToast.success`, and `sonnerToast.error` with the centralized API.
  - Note: `showToast` will be extended to support `loading` states if needed, or maintain a standard `info` look for downloads.

### Phase 3: Audit of Existing `showToast` Call Sites
Ensure consistent semantic usage of types:
- **File: `src/features/settings/components/LocalInferencePanel.tsx`**
  - Audit: Change "Update available" from `info` (currently black) to a styled `info` (centralized blue) via the context.
  - Verify all server start/stop/delete calls use the context.
- **File: `src/shared/hooks/useTranscribeRecording.ts`**
  - Verify semantic types for "Transcription complete" and errors.
- **File: `src/features/settings/components/AudioPanel.tsx`**
  - Verify transcription model validation toasts.
- **File: `extensions/llamacpp/components/ModelBrowser.tsx`**
  - Verify HuggingFace search error toasts.

### Phase 4: Clean-up of Dead Code
Remove these unused files to prevent accidental future usage:
- `components/Toast.tsx`
- `components/ToastContainer.tsx`
- `components/ErrorBanner.tsx`
- `components/ActionItem.tsx` (If verified unused during audit)

## Detailed File Impact List
| File Path | Impact | Change Description |
| :--- | :--- | :--- |
| `src/App.tsx` | Medium | Configure `Toaster` theme and global options. |
| `src/shared/contexts/ToastContext.tsx` | **High** | Core logic for icon/color standardization. |
| `src/features/recording/context/RecordingContext.tsx` | Medium | Migration from direct `sonner` to `useToast`. |
| `src/shared/components/ModelDownloadModal.tsx` | Medium | Migration from direct `sonner` to `useToast`. |
| `src/features/settings/components/LocalInferencePanel.tsx` | Low | Audit semantic toast types. |
| `components/Toast.tsx` | Delete | Remove legacy code. |
| `components/ToastContainer.tsx` | Delete | Remove legacy code. |
| `components/ErrorBanner.tsx` | Delete | Remove legacy code. |

## Final Quality Assurance
- **Dark Mode Validation**: Confirm that "Info" toasts are no longer "plain black" but use the centralized theme (Blue icon/border or light-blue background).
- **Icon Verification**: Check that every success toast has a checkmark and every error has a cross.
- **Consistency Check**: Trigger a "Recording deleted" (Context-based) and a "Model Download Ready" (Refactored from direct Sonner) and ensure they are visually identical.
