/** Curated on-device models (src-tauri/src/models): state, download, cancel, delete; progress on its download event. */

import { invoke } from '@tauri-apps/api/core';
import type { KvType } from '@config/personalization.config';
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
  /** A speech model's languages, as it spells them (BCP 47); empty for other kinds. */
  languages: string[];
  /** A speech model tells the language itself. */
  detectsLanguage: boolean;
  bytes: number;
  installed: boolean;
  downloading: boolean;
  /** Its download was interrupted: some of it is here and continues where it stopped. */
  partial: boolean;
  /** A downloaded chat model's context window, from its own config (null otherwise). */
  contextTokens: number | null;
  /** A downloaded chat model's chat template takes tools (tool calling); null otherwise. */
  tools: boolean | null;
  /** A downloaded chat model reads images (it ships a vision encoder); null otherwise. */
  vision: boolean | null;
  /** A chat model's quantization, as its weights file names it (`Q4_0`); null for other kinds. */
  quant: string | null;
  /** A chat model ships its own speculative-decoding draft, so replies can come faster. */
  drafts: boolean;
}

/** Payload of the download event (Rust `DownloadProgress`). */
export interface LocalModelDownload {
  id: string;
  state: 'downloading' | 'verifying' | 'done' | 'cancelled' | 'failed';
  received: number;
  total: number;
  error: string | null;
}

/** Payload of the model-load event (Rust `llama::report`): which role's model, and where its load stands. */
export interface ModelLoad {
  role: 'chat' | 'embedding' | 'voice';
  model: string;
  name: string;
  state: 'loading' | 'loaded' | 'failed';
}

/** Mirrors the Rust `LocalError` (`{ code, detail? }`), shared by every local-model command. */
export interface LocalErrorPayload {
  code: 'unknown-model' | 'not-downloaded' | 'bad-input' | 'download' | 'engine' | 'needs-language' | 'io';
  detail?: string;
}

export async function getLocalModels(): Promise<LocalModel[]> {
  if (!platform.hasLocalModels || !isTauriEnvironment()) return [];
  return invoke<LocalModel[]>('local_models');
}

export const downloadLocalModel = (id: string): Promise<void> => invoke('local_model_download', { id });

/** Bytes free for downloads on this device. */
export const localModelFreeSpace = (): Promise<number> => invoke('local_model_free_space');

export const cancelLocalModelDownload = (id: string): Promise<void> => invoke('local_model_cancel', { id });

export const removeLocalModel = (id: string): Promise<void> => invoke('local_model_remove', { id });

/** The memory llama.cpp projects for a downloaded chat model at `contextTokens` with a KV cache of `kvType`, bytes (its
 *  own measure, without loading the weights). */
export const projectedModelMemory = (id: string, contextTokens: number, kvType: KvType): Promise<number> =>
  invoke<number>('local_model_memory', { id, contextTokens, kvType });

/** How long unused models stay loaded, for every engine (0 = until quit). */
export const setLocalModelIdle = (minutes: number): Promise<void> => invoke('local_models_set_idle', { minutes });

/** Uses `dir` as the model directory (undefined: Roci's own folder); rejects when Roci can't read and write it. */
export const setLocalModelDirectory = (dir: string | undefined): Promise<void> => invoke('local_models_set_directory', { dir: dir ?? null });

/** Whole percent of a running download. */
export const downloadPercent = (download: Pick<LocalModelDownload, 'received' | 'total'>): number =>
  download.total > 0 ? Math.floor((download.received * 100) / download.total) : 0;
