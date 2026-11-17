/** Curated on-device models (src-tauri/src/models): state, download, cancel, delete; progress on its download event. */

import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '@services/tauri';
import { platform } from '@platform/index';

/** Mirrors the Rust `Kind`: speech-to-text, a read-aloud voice, text embeddings (meeting search), or chat. */
export type LocalModelKind = 'speech' | 'voice' | 'embedding' | 'chat';

/** Mirrors the Rust `LocalModelStatus`. */
export interface LocalModel {
  id: string;
  name: string;
  /** The Hugging Face org that made it, whose logo marks it in pickers. */
  maker: string;
  kind: LocalModelKind;
  /** Transcribes audio while it's still arriving (live dictation). */
  streams: boolean;
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
  if (!platform.hasLocalModels || !isTauriEnvironment()) return [];
  return invoke<LocalModel[]>('local_models');
}

export const downloadLocalModel = (id: string): Promise<void> => invoke('local_model_download', { id });

export const cancelLocalModelDownload = (id: string): Promise<void> => invoke('local_model_cancel', { id });

export const removeLocalModel = (id: string): Promise<void> => invoke('local_model_remove', { id });

/** How long unused models stay loaded, for every engine (0 = until quit). */
export const setLocalModelIdle = (minutes: number): Promise<void> => invoke('local_models_set_idle', { minutes });

/** Whole percent of a running download. */
export const downloadPercent = (download: Pick<LocalModelDownload, 'received' | 'total'>): number =>
  download.total > 0 ? Math.floor((download.received * 100) / download.total) : 0;
