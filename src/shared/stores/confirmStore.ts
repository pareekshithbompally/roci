/** One app-wide confirmation prompt: anything awaits `confirm(...)`, the single <ConfirmHost/> settles it. */

import { create } from 'zustand';

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

/** Ask the user. A newer request supersedes an open one, which resolves `false`. */
export function confirm(request: ConfirmRequest): Promise<boolean> {
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
    title: `Delete this ${noun}?`,
    description: "This can't be undone.",
    confirmLabel: 'Delete',
    tone: 'danger',
  });
}
