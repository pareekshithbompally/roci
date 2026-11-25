/** Chat on this device. The Mac: llama.cpp's own server, bundled and started by Roci on first use (`llama_server.rs`),
 *  spoken to like any llama-server. iPhone and iPad: llama.cpp inside the app (`llama.rs`). Models are catalog ids. */

import { Channel, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import type { ModelTuning } from '@config/personalization.config';
import type { ModelLoad } from '@services/localModels.service';
import type { StreamProgress } from '@services/ai/types';
import { platform } from '@platform/index';
import { getProviderType } from '@shared/utils/modelResolver';
import type { ResolvedModel } from '@shared/utils/modelResolver';

/** A turn as `local_chat` takes it. */
export interface LocalMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** A user turn's images, base64 of each file (the engine decodes them). */
  images?: string[];
  toolCalls?: { id: string; function: { name: string; arguments: unknown } }[];
  toolCallId?: string;
  toolName?: string;
}

export interface LocalChatRequest {
  streamId: number;
  messages: LocalMessage[];
  /** OpenAI-style function specs. */
  tools?: unknown[];
  /** A JSON schema (as text) the reply is decoded to: only tokens that keep it valid are generated. */
  schema?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  repetitionPenalty?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  /** How many recent tokens the three penalties count. */
  penaltyContext?: number;
  /** The most tokens the model keeps in mind; older ones roll off. */
  contextTokens?: number;
}

/** One piece of a reply, as generated. `arguments` is the tool input as JSON text. */
export type LocalChatEvent = { type: 'text'; text: string } | { type: 'tool-call'; id: string; name: string; arguments: string };

/** How the reply ended: token counts, and whether Stop ended it. */
export interface LocalChatResult {
  promptTokens: number;
  completionTokens: number;
  cancelled: boolean;
}

export function localChat(model: string, request: LocalChatRequest, onEvent: (event: LocalChatEvent) => void): Promise<LocalChatResult> {
  const channel = new Channel<LocalChatEvent>();
  channel.onmessage = onEvent;
  return invoke<LocalChatResult>('local_chat', { model, request, onEvent: channel });
}

export const localCancel = (streamId: number): Promise<void> => invoke('local_cancel', { streamId });

/** The Mac's on-device server (`http://127.0.0.1:<port>`), started first when it isn't running. */
export const onDeviceServerAddress = (): Promise<string> => invoke<string>('local_server_address');

/** Restarts the on-device server so changed engine settings and models apply; resolves its address. */
export const restartOnDeviceServer = (): Promise<string> => invoke<string>('local_server_restart');

/** The Mac's engine flags (Settings › Providers › On this device), as `local_server_configure` takes them. */
export interface OnDeviceEngine {
  idleMinutes: number;
  memoryMarginMib: number;
  cacheRamMib: number;
  modelsMax: number;
}

/** Sends the engine's flags and every chat model's resolved tuning (its preset options) to the Mac's server; resolves
 *  whether the running server started with others. */
export const configureOnDeviceServer = (engine: OnDeviceEngine, models: Record<string, ModelTuning>): Promise<boolean> =>
  invoke<boolean>('local_server_configure', { engine, models });

/** Whether the Mac's running on-device server started with settings other than the current ones. */
export const onDeviceRestartPending = (): Promise<boolean> => invoke<boolean>('local_server_restart_pending');

/** On the Mac a downloaded model is served by Roci's own llama-server, an OpenAI-compatible server like any other. */
export const servedOnDevice = (resolved: ResolvedModel): boolean =>
  platform.servesOnDeviceModels && getProviderType(resolved.provider) === 'on-device';

/** The model at the address it's spoken to: the Mac's own server's (started first when needed); any other as it is. */
export async function withServerAddress(resolved: ResolvedModel): Promise<ResolvedModel> {
  return servedOnDevice(resolved) ? { ...resolved, baseUrl: `${await onDeviceServerAddress()}/v1` } : resolved;
}


/** Follows an on-device chat model's load (llama.cpp reports its start and end): "Loading weights" until loaded or failed.
 *  Subscribed before the request, so the start can't be missed; resolves the unsubscribe. */
export async function followLocalLoad(model: string, onProgress: (progress: StreamProgress) => void): Promise<() => void> {
  const unlisten = await listen<ModelLoad>(LOCAL_MODELS_CONFIG.loadEvent, ({ payload }) => {
    if (payload.role === 'chat' && payload.model === model && payload.state === 'loading') {
      onProgress({ stage: 'loading-weights', percent: null });
    }
  });
  return unlisten;
}
