/** One app-wide confirmation prompt: anything awaits `confirm(...)`; the system alert answers it in the app, <ConfirmHost/> in a browser. */

import { create } from 'zustand';
import { dialogService, isTauriEnvironment } from '@services/tauri';
import { KIT_COPY } from '@config/kitCopy.config';

export interface ConfirmRequest {
  title: string;
  /** One short line: what happens, or why it matters. */
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` for destructive actions (red button); `default` otherwise. */
  tone?: 'danger' | 'default';
}

interface ConfirmState {
  /** Kept after settling so the sheet keeps its text through the exit animation. */
  request: ConfirmRequest | null;
  /** Non-null while the prompt is open. */
  resolve: ((confirmed: boolean) => void) | null;
}

const useConfirmStore = create<ConfirmState>()(() => ({ request: null, resolve: null }));

/** Ask the user: the system alert in the app; the drawn prompt (ConfirmHost) in a browser. A newer request supersedes an open one, which resolves `false`. */
export function confirm(request: ConfirmRequest): Promise<boolean> {
  if (isTauriEnvironment()) {
    return dialogService.confirm(request.title, request.description ?? '', {
      okLabel: request.confirmLabel,
      // the system alert's own default is "No"; a Mac alert says Cancel
      cancelLabel: request.cancelLabel ?? 'Cancel',
      warning: request.tone === 'danger',
    });
  }
  useConfirmStore.getState().resolve?.(false);
  return new Promise<boolean>((resolve) => {
    useConfirmStore.setState({ request, resolve });
  });
}

/** Answer the open prompt (no-op when none is open). */
export function settleConfirm(confirmed: boolean): void {
  const { resolve } = useConfirmStore.getState();
  if (!resolve) return;
  useConfirmStore.setState({ resolve: null });
  resolve(confirmed);
}

export const useConfirmRequest = () => useConfirmStore((s) => s.request);
export const useConfirmOpen = () => useConfirmStore((s) => s.resolve !== null);

/** The standard delete prompt: `Delete this <noun>?` with a red Delete. */
export function confirmDelete(noun: string): Promise<boolean> {
  return confirm({
    ...KIT_COPY.deletePrompt(noun),
    tone: 'danger',
  });
}
