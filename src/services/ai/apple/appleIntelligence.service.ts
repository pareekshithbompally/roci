/** Apple Intelligence plugin wrappers: on-device language model (availability, guided generation) and speech. */

import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '@services/tauri';
import { isCodedError } from '@shared/utils/errors';

const PLUGIN = 'plugin:apple-intelligence|';

/** Mirrors the Rust `apple_intelligence::Availability`. */
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

const UNSUPPORTED: AppleModelStatus = { availability: 'unsupported-system', contextTokens: 0 };

export const isAppleError = (error: unknown): error is AppleErrorPayload => isCodedError<AppleErrorPayload>(error);

export const appleIntelligence = {
  async status(): Promise<AppleModelStatus> {
    if (!isTauriEnvironment()) return UNSUPPORTED;
    const raw = await invoke<{ availability: AppleAvailability; context_tokens: number }>(`${PLUGIN}availability`);
    return { availability: raw.availability, contextTokens: raw.context_tokens };
  },

  /** One generation; `schema` (JSON Schema) makes it guided JSON output. */
  generate(instructions: string, prompt: string, schema?: object): Promise<string> {
    return invoke<string>(`${PLUGIN}generate`, { instructions, prompt, schema: schema ? JSON.stringify(schema) : null });
  },

  speechStatus: (language: string) => invoke<AppleSpeechStatus>(`${PLUGIN}speech_status`, { language }),
  speechRequestAccess: () => invoke<boolean>(`${PLUGIN}speech_request_access`),
  speechPrepare: (language: string) => invoke<void>(`${PLUGIN}speech_prepare`, { language }),
};
