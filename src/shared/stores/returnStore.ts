/** Where to come back to: a place that opens something elsewhere (Knowledge opening a meeting or a chat) leaves a return
 *  point, and the shell's back control (the ‹ › capsule on a Mac, ‹ in the iPhone bar, ⌘[) takes you back to it as you
 *  left it. The newest first; going back uses it up. */

import { create } from 'zustand';

export interface ReturnPoint {
  /** Where back goes ("Knowledge"), for its name. */
  label: string;
  /** Puts that place back as it was (its view, selection, filter). */
  restore: () => void;
}

interface ReturnState {
  points: ReturnPoint[];
}

export const useReturnStore = create<ReturnState>(() => ({ points: [] }));

/** Leaves a way back here before going elsewhere. */
export function leaveReturnPoint(point: ReturnPoint): void {
  useReturnStore.setState((state) => ({ points: [...state.points, point] }));
}

/** Goes back to the newest return point, if any. */
export function goBack(): void {
  const { points } = useReturnStore.getState();
  const last = points.at(-1);
  if (!last) return;
  useReturnStore.setState({ points: points.slice(0, -1) });
  last.restore();
}

/** The newest return point (what back goes to), or none. */
export const useReturnPoint = (): ReturnPoint | undefined => useReturnStore((s) => s.points.at(-1));
