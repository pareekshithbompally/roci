/** MLX on this device (Rust → RociMLX): stream a chat reply, stop it, embed texts. Models are local catalog ids. */

import { Channel, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import type { ModelLoad } from '@services/localModels.service';
import type { StreamProgress } from '@services/ai/types';

/** A turn as the Swift bridge takes it (`ChatMessage`). */
export interface MlxMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** A user turn's images, base64 of each file (the engine decodes them). */
  images?: string[];
  toolCalls?: { id: string; function: { name: string; arguments: unknown } }[];
  toolCallId?: string;
  toolName?: string;
}

export interface MlxChatRequest {
  streamId: number;
  messages: MlxMessage[];
  /** OpenAI-style function specs. */
  tools?: unknown[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
}

/** One piece of a reply, as generated. `arguments` is the tool input as JSON text. */
export type MlxChatEvent = { type: 'text'; text: string } | { type: 'tool-call'; id: string; name: string; arguments: string };

/** How the reply ended: token counts, and whether Stop ended it. */
export interface MlxChatResult {
  promptTokens: number;
  completionTokens: number;
  cancelled: boolean;
}

export function mlxChat(model: string, request: MlxChatRequest, onEvent: (event: MlxChatEvent) => void): Promise<MlxChatResult> {
  const channel = new Channel<MlxChatEvent>();
  channel.onmessage = onEvent;
  return invoke<MlxChatResult>('mlx_chat', { model, request, onEvent: channel });
}

export const mlxCancel = (streamId: number): Promise<void> => invoke('mlx_cancel', { streamId });

/** Unit-length vectors for `texts`, in order. */
export const mlxEmbed = (model: string, texts: string[]): Promise<number[][]> => invoke<number[][]>('mlx_embed', { model, texts });

/** Follows an on-device chat model's load (MLX reports its start and end): "Loading weights" until loaded or failed.
 *  Subscribed before the request, so the start can't be missed; resolves the unsubscribe. */
export async function followMlxLoad(model: string, onProgress: (progress: StreamProgress) => void): Promise<() => void> {
  const unlisten = await listen<ModelLoad>(LOCAL_MODELS_CONFIG.loadEvent, ({ payload }) => {
    if (payload.role === 'chat' && payload.model === model && payload.state === 'loading') {
      onProgress({ stage: 'loading-weights', percent: null });
    }
  });
  return unlisten;
}
