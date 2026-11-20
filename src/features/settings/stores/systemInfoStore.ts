/** Lazily loaded, module-cached storage path and version for the General and Storage panels. */

import { useSyncExternalStore } from 'react';
import { isTauriEnvironment } from '@services/tauri';
import { pathsService } from '@services/storage';

// ── Types ────────────────────────────────────────────────────────

interface SystemInfoSnapshot {
  storagePath: string | null;
  storagePathError: string | null;
  appVersion: string;
  isLoaded: boolean;
  error: string | null;
}

// ── Module state ─────────────────────────────────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();

const initialSnapshot: SystemInfoSnapshot = {
  storagePath: null,
  storagePathError: null,
  appVersion: '',
  isLoaded: false,
  error: null,
};

let snapshot: SystemInfoSnapshot = { ...initialSnapshot };
let loadPromise: Promise<void> | null = null;

function emitChange() {
  for (const listener of listeners) listener();
}

function updateSnapshot(patch: Partial<SystemInfoSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  emitChange();
}

// ── Store API ────────────────────────────────────────────────────

export const systemInfoStore = {
  getSnapshot(): SystemInfoSnapshot {
    return snapshot;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    if (!loadPromise) {
      loadPromise = loadAllData();
    }
    return () => listeners.delete(listener);
  },

  /** Start loading early (Settings opened) so the System panel mounts with data. */
  preload(): void {
    if (!loadPromise) loadPromise = loadAllData();
  },

  /** Reload all data (for after rebuild operations) */
  async refresh(): Promise<void> {
    loadPromise = loadAllData();
    await loadPromise;
  },

  /** Set app version (called by loadAllData or externally) */
  setAppVersion(version: string): void {
    updateSnapshot({ appVersion: version });
  },
};

// ── Data loading ─────────────────────────────────────────────────

async function loadAllData(): Promise<void> {
  if (!isTauriEnvironment()) {
    updateSnapshot({ isLoaded: true });
    return;
  }

  try {
    const [basePath, version] = await Promise.all([pathsService.getBasePath().catch(() => null), loadAppVersion()]);

    updateSnapshot({
      storagePath: basePath,
      storagePathError: basePath ? null : 'Unable to resolve storage location.',
      appVersion: version,
      isLoaded: true,
      error: null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    updateSnapshot({ isLoaded: true, error: msg });
  }
}

async function loadAppVersion(): Promise<string> {
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    return await getVersion();
  } catch {
    return 'unknown';
  }
}

// ── React Hook ───────────────────────────────────────────────────

export function useSystemInfo(): SystemInfoSnapshot {
  return useSyncExternalStore(
    systemInfoStore.subscribe,
    systemInfoStore.getSnapshot,
    systemInfoStore.getSnapshot,
  );
}
