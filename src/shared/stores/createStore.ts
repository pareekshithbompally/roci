/** Adding something (a to-do, a note, a chat about a meeting): the one thing being added, and for which meeting. Every + in
 *  the app calls `startCreate`; one host (`CreateHost`) shows the surface for it on this platform: a corner panel on a Mac,
 *  a new screen on iPhone. One at a time: starting another replaces it. */

import { create } from 'zustand';

export type CreateKind = 'todo' | 'note' | 'chat';

export interface CreateFlow {
  /** Each start's own, so a new start opens fresh. */
  id: number;
  kind: CreateKind;
  /** The meeting it belongs to; null for a to-do of its own. */
  meetingId: string | null;
}

const useCreateStore = create<{ flow: CreateFlow | null }>()(() => ({ flow: null }));

export const useCreateFlow = () => useCreateStore((s) => s.flow);

let starts = 0;

export function startCreate(kind: CreateKind, meetingId: string | null = null): void {
  starts += 1;
  useCreateStore.setState({ flow: { id: starts, kind, meetingId } });
}

export function endCreate(): void {
  useCreateStore.setState({ flow: null });
}
