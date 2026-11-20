/** The update state Rust pushes (one copy for the tray row, Settings and the menu bar's Check), plus a check in flight. */

import { create } from 'zustand';
import { IDLE_UPDATE, type UpdateState } from '@services/tauri';

interface UpdateStore {
  state: UpdateState;
  /** A Check for Updates is running. */
  checking: boolean;
  /** The version the user put off with Later: its tray row stays hidden (the menu bar still offers it). */
  deferred: string | null;
}

export const useUpdateStore = create<UpdateStore>(() => ({ state: IDLE_UPDATE, checking: false, deferred: null }));

export const useUpdateState = () => useUpdateStore((s) => s.state);
export const useUpdateChecking = () => useUpdateStore((s) => s.checking);
export const useUpdateDeferred = () => useUpdateStore((s) => s.deferred);
