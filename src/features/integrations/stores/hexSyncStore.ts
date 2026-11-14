/**
 * hexSyncStore — what the Hex integration row shows: the meeting-finished
 * watcher's state and the last catch-up. Written by useHexRuntime only.
 */

import { create } from 'zustand';
import type { HexEventsState } from '@services/hex';

interface HexSyncState {
  events: HexEventsState | null;
  syncing: boolean;
  /** Epoch ms of the last finished catch-up, for throttling and "Synced …". */
  lastSyncedAt: number | null;
  /** Why the last catch-up failed (e.g. Hex isn't installed). */
  error: string | null;
  setEvents: (events: HexEventsState | null) => void;
  syncStarted: () => void;
  syncFinished: (error: string | null) => void;
}

export const useHexSyncStore = create<HexSyncState>((set) => ({
  events: null,
  syncing: false,
  lastSyncedAt: null,
  error: null,
  setEvents: (events) => set({ events }),
  syncStarted: () => set({ syncing: true }),
  syncFinished: (error) => set({ syncing: false, error, lastSyncedAt: Date.now() }),
}));
