/** Apple Intelligence plugin wrappers: on-device language model (availability, guided generation, streamed chat) and speech. */

import { Channel, invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '@services/tauri';
import { platform } from '@platform/index';
import { failureLogger, isCodedError } from '@shared/utils/errors';
import type { LiveText } from '@services/ai/transcription/streaming';

const PLUGIN = 'plugin:apple-intelligence|';

/** Mirrors the Rust `apple_intelligence::Availability`, plus `unsupported-system` outside the native app. */
export type AppleAvailability =
  | 'available'
  | 'device-not-eligible'
  | 'apple-intelligence-off'
  | 'model-not-ready'
  | 'unsupported-system'
  | 'unknown';

export interface AppleModelStatus {
  availability: AppleAvailability;
  /** Context window in tokens; 0 when unavailable. */
  contextTokens: number;
}

/** Mirrors the Rust `AppleError` (`{ code, detail? }`). */
export interface AppleErrorPayload {
  code: 'context-window' | 'refused' | 'unavailable' | 'timeout' | 'not-authorized' | 'model-not-ready' | 'unsupported-language' | 'failed';
  detail?: string;
}

export interface AppleSpeechStatus {
  available: boolean;
  authorization: 'authorized' | 'denied' | 'not_determined' | 'restricted';
  /** The language's speech model is downloaded. */
  installed: boolean;
}

/** A chat for the on-device model: instructions, then turns ending with the user's. */
export interface AppleChatRequest {
  instructions: string;
  turns: Array<{ role: 'user' | 'assistant'; text: string }>;
}

/** Mirrors the Rust `StreamEvent`. */
type StreamEvent = { event: 'delta'; data: string } | { event: 'finish' };

const report = failureLogger('appleIntelligence');

const UNSUPPORTED: AppleModelStatus = { availability: 'unsupported-system', contextTokens: 0 };

/** A DOMException (an abort's reason) has a numeric `code` too; only the native payload's is a string. */
export const isAppleError = (error: unknown): error is AppleErrorPayload =>
  isCodedError<AppleErrorPayload>(error) && typeof error.code === 'string';

export const appleIntelligence = {
  async status(): Promise<AppleModelStatus> {
    if (!platform.hasAppleIntelligence || !isTauriEnvironment()) return UNSUPPORTED;
    const raw = await invoke<{ availability: AppleAvailability; context_tokens: number }>(`${PLUGIN}availability`);
    return { availability: raw.availability, contextTokens: raw.context_tokens };
  },

  /**
   * One generation; `schema` (JSON Schema) makes it guided JSON output. Aborting `signal` stops it natively and
   * rejects with its reason at once; an already-aborted signal never starts it.
   */
  generate(instructions: string, prompt: string, schema?: object, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    // Random, not a counter: native remembers early cancels by id, and a webview reload would restart a counter.
    const [id] = crypto.getRandomValues(new Uint32Array(1));
    return new Promise<string>((resolve, reject) => {
      const cancel = () => {
        invoke(`${PLUGIN}generate_cancel`, { id }).catch(report('stop generation'));
        reject(signal?.reason);
      };
      signal?.addEventListener('abort', cancel, { once: true });
      invoke<string>(`${PLUGIN}generate`, { id, instructions, prompt, schema: schema ? JSON.stringify(schema) : null })
        .then(resolve, reject)
        .finally(() => signal?.removeEventListener('abort', cancel));
    });
  },

  /**
   * Streams a chat reply to `onDelta`; resolves once the last piece has arrived (channel messages can trail the
   * command's reply, so `finish` ends it). Aborting `signal` stops generation natively and rejects with its reason.
   * Nothing reaches `onDelta` once it has settled.
   */
  stream(request: AppleChatRequest, onDelta: (text: string) => void, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (end: () => void) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', cancel);
        end();
      };
      const channel = new Channel<StreamEvent>((message) => {
        if (settled) return;
        if (message.event === 'delta') onDelta(message.data);
        else settle(resolve);
      });
      const cancel = () => {
        invoke(`${PLUGIN}stream_cancel`, { channelId: channel.id }).catch(report('stop stream'));
        settle(() => reject(signal?.reason));
      };
      signal?.addEventListener('abort', cancel, { once: true });
      invoke(`${PLUGIN}stream`, { request: JSON.stringify(request), onDelta: channel })
        .catch((error: unknown) => settle(() => reject(error)));
    });
  },

  speechStatus: (language: string) => invoke<AppleSpeechStatus>(`${PLUGIN}speech_status`, { language }),
  speechRequestAccess: () => invoke<boolean>(`${PLUGIN}speech_request_access`),
  speechPrepare: (language: string) => invoke<void>(`${PLUGIN}speech_prepare`, { language }),

  /** Live speech stream `id` (the caller's): several run at once, each its own analyzer. */
  speechLiveStart: (id: number, language: string) => invoke<void>(`${PLUGIN}speech_live_start`, { id, language }),
  /** Feeds 16 kHz mono f32 (the raw invoke body, so the id goes as a header); the text so far. */
  speechLiveFeed: (id: number, pcm: Float32Array) =>
    invoke<LiveText>(`${PLUGIN}speech_live_feed`, new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), {
      headers: { 'x-stream': String(id) },
    }),
  /** Ends the stream once its audio is transcribed; everything it heard. */
  speechLiveFinish: (id: number) => invoke<string>(`${PLUGIN}speech_live_finish`, { id }),
  speechLiveCancel: (id: number) => invoke<void>(`${PLUGIN}speech_live_cancel`, { id }),
};
