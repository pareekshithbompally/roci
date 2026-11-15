/**
 * Local models — the curated models Kasset downloads and runs on this Mac
 * (src-tauri/src/models): their state, download, cancel and delete. Progress
 * arrives as `LOCAL_MODELS_CONFIG.downloadEvent`.
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '@services/tauri';

/** Mirrors the Rust `Kind`: speech-to-text, or a read-aloud voice. */
export type LocalModelKind = 'speech' | 'voice';

/** Mirrors the Rust `LocalModelStatus`. */
export interface LocalModel {
  id: string;
  name: string;
  kind: LocalModelKind;
  bytes: number;
  installed: boolean;
  downloading: boolean;
}

/** Payload of the download event (Rust `DownloadProgress`). */
export interface LocalModelDownload {
  id: string;
  state: 'downloading' | 'verifying' | 'done' | 'cancelled' | 'failed';
  received: number;
  total: number;
  error: string | null;
}

/** Mirrors the Rust `LocalError` (`{ code, detail? }`), shared by every local-model command. */
export interface LocalErrorPayload {
  code: 'unknown-model' | 'not-downloaded' | 'bad-input' | 'download' | 'engine' | 'io';
  detail?: string;
}

export async function getLocalModels(): Promise<LocalModel[]> {
  if (!isTauriEnvironment()) return [];
  return invoke<LocalModel[]>('local_models');
}

export const downloadLocalModel = (id: string): Promise<void> => invoke('local_model_download', { id });

export const cancelLocalModelDownload = (id: string): Promise<void> => invoke('local_model_cancel', { id });

export const removeLocalModel = (id: string): Promise<void> => invoke('local_model_remove', { id });

/** Whole percent of a running download. */
export const downloadPercent = (download: Pick<LocalModelDownload, 'received' | 'total'>): number =>
  download.total > 0 ? Math.floor((download.received * 100) / download.total) : 0;
