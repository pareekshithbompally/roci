/**
 * Server Manager
 *
 * Manages the llama-server process lifecycle: start, stop, health monitoring.
 * Exposes the running server URL for use by the openai-compat adapter.
 */

import { invoke } from '@tauri-apps/api/core';
import { getBinaryPath } from './backend';
import { loadRegistry } from './models';
import type {
  ServerStatus,
  SpawnResult,
  HealthStatus,
  ServerConfig,
  ManagedModel,
} from './types';

/** Default server configuration */
const DEFAULT_CONFIG: ServerConfig = {
  ctxSize: 4096,
  nGpuLayers: -1,
  threads: 4,
};

/** In-memory server state */
let currentStatus: ServerStatus = 'idle';
let currentPid: number | null = null;
let currentPort: number | null = null;
let currentModelId: string | null = null;
let serverConfig: ServerConfig = { ...DEFAULT_CONFIG };

/** Listeners for status changes */
type StatusListener = (status: ServerStatus) => void;
const listeners = new Set<StatusListener>();

function setStatus(status: ServerStatus) {
  currentStatus = status;
  listeners.forEach((fn) => fn(status));
}

/** Subscribe to server status changes */
export function onStatusChange(listener: StatusListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Get the current server status */
export function getStatus(): ServerStatus {
  return currentStatus;
}

/** Get the currently loaded model ID */
export function getCurrentModelId(): string | null {
  return currentModelId;
}

/** Get the running server's base URL, or null if not running */
export function getServerUrl(): string | null {
  if (currentStatus !== 'running' || currentPort === null) return null;
  return `http://127.0.0.1:${currentPort}/v1`;
}

/** Get the current server PID, or null if not running */
export function getServerPid(): number | null {
  return currentPid;
}

/** Get the current server port, or null if not running */
export function getServerPort(): number | null {
  return currentPort;
}

/** Update server configuration */
export function setServerConfig(config: Partial<ServerConfig>): void {
  serverConfig = { ...serverConfig, ...config };
}

/** Get server configuration */
export function getServerConfig(): ServerConfig {
  return { ...serverConfig };
}

/**
 * Start the llama-server with the specified model.
 *
 * @param modelId - The ID of a model from the managed registry.
 * @throws If the binary is not installed or the model is not found.
 */
export async function startServer(modelId: string): Promise<void> {
  if (currentStatus === 'running' || currentStatus === 'starting') {
    if (currentModelId === modelId) return; // Already running with this model
    await stopServer(); // Stop to swap models
  }

  setStatus('starting');

  try {
    // Resolve binary path
    const binaryPath = await getBinaryPath();
    if (!binaryPath) {
      throw new Error(
        'llama-server binary not installed. Please download it from Settings.'
      );
    }

    // Ensure shared library symlinks exist (fixes older installs)
    try {
      const binDir = binaryPath.substring(0, binaryPath.lastIndexOf('/'));
      await invoke('plugin:llamacpp|fix_lib_symlinks', { dirPath: binDir });
    } catch {
      // Non-fatal — symlinks may already exist
    }

    // Resolve model path
    const registry = await loadRegistry();
    const model = registry.models.find((m) => m.id === modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    // Get a random available port
    const port: number = await invoke('plugin:llamacpp|get_random_port');

    // Build extra args from config
    const args: string[] = [
      '--ctx-size',
      String(serverConfig.ctxSize),
      '--n-gpu-layers',
      String(serverConfig.nGpuLayers),
      '--threads',
      String(serverConfig.threads),
    ];

    if (serverConfig.apiKey) {
      args.push('--api-key', serverConfig.apiKey);
    }

    // Spawn the server
    const result: SpawnResult = await invoke(
      'plugin:llamacpp|spawn_llama_server',
      {
        binaryPath,
        modelPath: model.filePath,
        port,
        args,
      }
    );

    currentPid = result.pid;
    currentPort = result.port;
    currentModelId = modelId;
    setStatus('running');
  } catch (e) {
    currentPid = null;
    currentPort = null;
    currentModelId = null;
    setStatus('error');
    throw e;
  }
}

/**
 * Stop the running llama-server.
 */
export async function stopServer(): Promise<void> {
  if (currentPid === null) {
    setStatus('idle');
    return;
  }

  setStatus('stopping');

  try {
    await invoke('plugin:llamacpp|kill_llama_server', { pid: currentPid });
  } catch (e) {
    console.error('[llamacpp] Error killing server:', e);
  }

  currentPid = null;
  currentPort = null;
  currentModelId = null;
  setStatus('idle');
}

/**
 * Check the health of the running server.
 */
export async function checkHealth(): Promise<HealthStatus> {
  if (currentPort === null) {
    return { ok: false, status: 'not running' };
  }

  return await invoke('plugin:llamacpp|check_server_health', {
    port: currentPort,
  });
}

/**
 * Get all managed models as provider-compatible model entries.
 *
 * Returns model objects in the format expected by the providers system.
 */
export async function getProviderModels(): Promise<
  Array<{ id: string; name: string }>
> {
  const registry = await loadRegistry();
  return registry.models.map((m) => ({
    id: m.id,
    name: m.name,
  }));
}
