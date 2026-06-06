/**
 * Types for the llama.cpp extension.
 */

/** Server lifecycle states */
export type ServerStatus = 'idle' | 'downloading' | 'starting' | 'running' | 'stopping' | 'error';

/** Result from spawning the server via Tauri */
export interface SpawnResult {
  pid: number;
  port: number;
}

/** Basic GGUF metadata read from the file header */
export interface GgufMetadata {
  file_size: number;
  magic: string;
  version: number;
}

/** Health check result from llama-server */
export interface HealthStatus {
  ok: boolean;
  status: string;
}

/** A managed model entry in the local registry */
export interface ManagedModel {
  id: string;
  name: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  source: 'huggingface' | 'local';
  sourceUrl?: string;
  ggufVersion?: number;
  addedAt: number;
}

/** The model registry persisted to disk */
export interface ModelRegistry {
  models: ManagedModel[];
}

/** Download progress info */
export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percent: number;
}

/** llama-server launch configuration */
export interface ServerConfig {
  ctxSize: number;
  nGpuLayers: number;
  threads: number;
  apiKey?: string;
}

/** GitHub release asset info */
export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

/** GitHub release info */
export interface GitHubRelease {
  tag_name: string;
  name: string;
  assets: ReleaseAsset[];
}

/** Installed binary info */
export interface InstalledBinary {
  version: string;
  path: string;
  installedAt: number;
}

/** Phases during binary download/install */
export type BinaryDownloadPhase = 'downloading' | 'extracting' | 'validating' | 'done';

/** HuggingFace model search result */
export interface HfModelResult {
  id: string;
  author: string;
  downloads: number;
  likes: number;
  tags: string[];
}

/** A file in a HuggingFace repo */
export interface HfModelFile {
  name: string;
  size: number;
  isGguf: boolean;
}
