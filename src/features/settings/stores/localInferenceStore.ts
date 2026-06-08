/**
 * Local Inference Store (Zustand)
 *
 * Client store for the llama.cpp runtime: server lifecycle (status/config/url),
 * the locally-installed model registry, binary info, and the HF token. The
 * underlying extension modules (server.ts, backend.ts, models.ts) own the
 * heavy lifting; this store mirrors their state into a React-subscribable
 * Zustand store and coordinates disk reads.
 *
 * - React reads via `useLocalInference()` (shallow-selected snapshot).
 * - Imperative callers use the `localInferenceStore` facade.
 * - HF *network* reads do NOT live here — they go through TanStack Query
 *   (see extensions/llamacpp/hooks.ts). This store only holds local state.
 */

import { useEffect } from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import * as server from '@extensions/llamacpp/server';
import * as backend from '@extensions/llamacpp/backend';
import * as models from '@extensions/llamacpp/models';
import { loadHfToken, saveHfToken as persistHfToken } from '@extensions/llamacpp/settings';
import { useDownloadStore, onDownloadComplete } from '@extensions/llamacpp/downloadStore';
import type {
  ServerStatus,
  ServerConfig,
  InstalledBinary,
  ManagedModel,
} from '@extensions/llamacpp/types';

// ── State ────────────────────────────────────────────────────────

interface LocalInferenceState {
  serverStatus: ServerStatus;
  serverConfig: ServerConfig;
  serverUrl: string | null;
  currentModelId: string | null;
  binaryInfo: InstalledBinary | null;
  managedModels: ManagedModel[];
  hfToken: string;
  /** Whether the initial disk read has completed */
  isLoaded: boolean;
  /** Error from the last load attempt, if any */
  error: string | null;

  refresh: () => Promise<void>;
  startServer: (modelId: string) => Promise<void>;
  stopServer: () => Promise<void>;
  setServerConfig: (config: Partial<ServerConfig>) => void;
  deleteModel: (modelId: string) => Promise<void>;
  startBinaryDownload: () => void;
}

export const useLocalInferenceStore = create<LocalInferenceState>()((_set, get) => ({
  serverStatus: server.getStatus(),
  serverConfig: server.getServerConfig(),
  serverUrl: server.getServerUrl(),
  currentModelId: server.getCurrentModelId(),
  binaryInfo: null,
  managedModels: [],
  hfToken: '',
  isLoaded: false,
  error: null,

  refresh: () => loadAllData(),
  // Server status/url/model sync back through the onStatusChange subscription.
  startServer: (modelId) => server.startServer(modelId),
  stopServer: () => server.stopServer(),
  setServerConfig: (config) => {
    server.setServerConfig(config);
    useLocalInferenceStore.setState(syncServerFields());
  },
  deleteModel: async (modelId) => {
    await models.deleteModel(modelId);
    await loadModels();
  },
  startBinaryDownload: () => useDownloadStore.getState().startBinaryDownload(),
}));

// ── Sync helpers ─────────────────────────────────────────────────

const setState = useLocalInferenceStore.setState;

function syncServerFields(): Partial<LocalInferenceState> {
  return {
    serverStatus: server.getStatus(),
    serverConfig: server.getServerConfig(),
    serverUrl: server.getServerUrl(),
    currentModelId: server.getCurrentModelId(),
  };
}

async function loadAllData(): Promise<void> {
  try {
    await Promise.all([loadBinaryInfo(), loadModels(), loadToken()]);
    setState({ isLoaded: true, error: null });
  } catch (e: unknown) {
    setState({ isLoaded: true, error: e instanceof Error ? e.message : String(e) });
  }
}

async function loadBinaryInfo(): Promise<void> {
  try {
    setState({ binaryInfo: await backend.getInstalledBinary() });
  } catch (e: unknown) {
    console.warn('[localInferenceStore] Failed to load binary info:', e);
    setState({ binaryInfo: null });
  }
}

async function loadModels(): Promise<void> {
  try {
    setState({ managedModels: await models.getModels() });
  } catch (e: unknown) {
    console.warn('[localInferenceStore] Failed to load models:', e);
    setState({ managedModels: [] });
  }
}

async function loadToken(): Promise<void> {
  try {
    const token = await loadHfToken();
    setState({ hfToken: token || '' });
  } catch {
    // HF token is optional
  }
}

// ── One-time init (lazy: first hook mount) ───────────────────────

let initialized = false;
function ensureInit(): void {
  if (initialized) return;
  initialized = true;
  server.onStatusChange(() => setState(syncServerFields()));
  onDownloadComplete((type) => {
    if (type === 'model') loadModels();
    else if (type === 'binary') loadBinaryInfo();
  });
  setState(syncServerFields());
  void loadAllData();
}

// ── React hook ───────────────────────────────────────────────────

export function useLocalInference() {
  useEffect(() => {
    ensureInit();
  }, []);
  return useLocalInferenceStore(
    useShallow((s) => ({
      serverStatus: s.serverStatus,
      serverConfig: s.serverConfig,
      serverUrl: s.serverUrl,
      currentModelId: s.currentModelId,
      binaryInfo: s.binaryInfo,
      managedModels: s.managedModels,
      hfToken: s.hfToken,
      isLoaded: s.isLoaded,
      error: s.error,
    })),
  );
}

// ── Imperative facade (non-React / event handlers) ───────────────

export const localInferenceStore = {
  getSnapshot: () => useLocalInferenceStore.getState(),
  refresh: () => useLocalInferenceStore.getState().refresh(),
  startServer: (modelId: string) => useLocalInferenceStore.getState().startServer(modelId),
  stopServer: () => useLocalInferenceStore.getState().stopServer(),
  setServerConfig: (config: Partial<ServerConfig>) =>
    useLocalInferenceStore.getState().setServerConfig(config),
  deleteModel: (modelId: string) => useLocalInferenceStore.getState().deleteModel(modelId),
  startBinaryDownload: () => useLocalInferenceStore.getState().startBinaryDownload(),
};

// ── HF token persistence (keeps store in sync for HF queries) ────

export async function saveHfToken(token: string): Promise<void> {
  await persistHfToken(token);
  useLocalInferenceStore.setState({ hfToken: token });
}

export { loadHfToken };
