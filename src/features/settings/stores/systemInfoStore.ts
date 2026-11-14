/**
 * System Info Store
 *
 * External store for InterfacePanel data: index stats, disk usage,
 * storage path, and app version. Loads lazily once, cached in-module.
 * Uses useSyncExternalStore — survives component unmounts.
 */

import { useSyncExternalStore } from 'react';
import { isTauriEnvironment } from '@services/tauri';
import { pathsService } from '@services/storage';
import { searchIndexingService } from '@services/searchIndexing.service';
import { meetingService } from '@services/meeting.service';

// ── Types ────────────────────────────────────────────────────────

export interface IndexStats {
  meetings: { indexed: number; onDisk: number };
  chats: { indexed: number; onDisk: number };
  chunks: { total: number; transcript: number };
  kg: { nodes: number; edges: number };
}

export interface DiskUsageEntry {
  label: string;
  bytes: number;
}

/** Fixed Disk Usage rows (folder → label, plus the store DB) so the panel can lay them out before sizes load. */
const DISK_USAGE_DIRS = [
  { label: 'Meetings', name: 'meetings' },
  { label: 'Recordings', name: 'recordings' },
  { label: 'Chats', name: 'chats' },
  { label: 'Cache', name: 'cache' },
] as const;
const STORE_DB = { label: 'Store DB', name: 'kasset.db' } as const;
export const DISK_USAGE_LABELS: readonly string[] = [...DISK_USAGE_DIRS.map((d) => d.label), STORE_DB.label];

interface SystemInfoSnapshot {
  storagePath: string | null;
  storagePathError: string | null;
  diskUsage: DiskUsageEntry[] | null;
  appVersion: string;
  indexStats: IndexStats | null;
  isLoaded: boolean;
  error: string | null;
}

// ── Module state ─────────────────────────────────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();

const initialSnapshot: SystemInfoSnapshot = {
  storagePath: null,
  storagePathError: null,
  diskUsage: null,
  appVersion: '',
  indexStats: null,
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
    const [basePath, stats, diskMeetings, diskChats, version] = await Promise.all([
      pathsService.getBasePath().catch(() => null),
      loadIndexStatsInternal(),
      meetingService.listMeetings().catch(() => []),
      searchIndexingService.loadChatsForIndexing().then(c => c.length).catch(() => 0),
      loadAppVersion(),
    ]);

    const indexStats: IndexStats | null = stats
      ? {
          meetings: { indexed: stats.total_meetings, onDisk: diskMeetings.length },
          chats: { indexed: stats.chat_sessions, onDisk: diskChats },
          chunks: { total: stats.total_chunks, transcript: stats.transcript_chunks },
          kg: { nodes: stats.kg_nodes, edges: stats.kg_edges },
        }
      : null;

    let diskUsage: DiskUsageEntry[] | null = null;
    if (basePath) {
      diskUsage = await loadDiskUsage(basePath);
    }

    updateSnapshot({
      storagePath: basePath,
      storagePathError: basePath ? null : 'Unable to resolve storage location.',
      diskUsage,
      appVersion: version,
      indexStats,
      isLoaded: true,
      error: null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    updateSnapshot({ isLoaded: true, error: msg });
  }
}

async function loadIndexStatsInternal(): Promise<{
  total_meetings: number;
  chat_sessions: number;
  total_chunks: number;
  transcript_chunks: number;
  kg_nodes: number;
  kg_edges: number;
} | null> {
  try {
    const { vectorDB } = await import('@extensions/rag');
    return await vectorDB.getStats();
  } catch (e: unknown) {
    console.error('[systemInfoStore] Failed to load index stats:', e);
    return null;
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

async function loadDiskUsage(basePath: string): Promise<DiskUsageEntry[]> {
  try {
    const { readDir, stat } = await import('@tauri-apps/plugin-fs');
    const { join } = await import('@tauri-apps/api/path');

    const sizes: DiskUsageEntry[] = [];

    // Every row is always present (0 B when missing) so the layout never changes on load.
    for (const dir of DISK_USAGE_DIRS) {
      const bytes = await getDirSize(await join(basePath, dir.name), readDir, stat, join).catch(() => 0);
      sizes.push({ label: dir.label, bytes });
    }

    const dbBytes = await stat(await join(basePath, STORE_DB.name)).then((s) => s.size).catch(() => 0);
    sizes.push({ label: STORE_DB.label, bytes: dbBytes });

    return sizes;
  } catch (e: unknown) {
    console.error('[systemInfoStore] Failed to load disk usage:', e);
    return [];
  }
}

// Recursively compute directory size
async function getDirSize(
  dirPath: string,
  readDir: (path: string) => Promise<Array<{ name: string; isDirectory: boolean; isFile: boolean }>>,
  stat: (path: string) => Promise<{ size: number }>,
  join: (...parts: string[]) => Promise<string>,
): Promise<number> {
  let total = 0;
  try {
    const entries = await readDir(dirPath);
    for (const entry of entries) {
      const entryPath = await join(dirPath, entry.name);
      if (entry.isDirectory) {
        total += await getDirSize(entryPath, readDir, stat, join);
      } else if (entry.isFile) {
        try {
          const s = await stat(entryPath);
          total += s.size;
        } catch {
          // Skip files we can't stat
        }
      }
    }
  } catch {
    // Directory might not exist
  }
  return total;
}

// ── React Hook ───────────────────────────────────────────────────

export function useSystemInfo(): SystemInfoSnapshot {
  return useSyncExternalStore(
    systemInfoStore.subscribe,
    systemInfoStore.getSnapshot,
    systemInfoStore.getSnapshot,
  );
}
