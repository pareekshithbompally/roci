/**
 * Hex — transcription through the running Hex app (src-tauri/src/hex_stt):
 * status, downloaded models, error copy, and the per-part adapter. Splitting,
 * progress and cancellation live in the shared pipeline.
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '@services/tauri';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import type { TranscribePart } from './types';
import { errorMessage, isCodedError } from '@shared/utils/errors';

/** Mirrors the Rust `HexModel`. */
export interface HexModel {
  id: string;
  name: string;
  installed: boolean;
}

/** Mirrors the Rust `HexStatus`. */
export interface HexStatus {
  running: boolean;
  models: HexModel[];
}

/** Mirrors the Rust `HexError` (`{ code, detail? }`). */
interface HexErrorPayload {
  code: 'not-running' | 'not-installed' | 'incompatible' | 'unauthorized' | 'model-not-ready' | 'busy' | 'too-large' | 'rejected';
  detail?: string;
}

const NOT_RUNNING: HexStatus = { running: false, models: [] };

export async function getHexStatus(): Promise<HexStatus> {
  if (!isTauriEnvironment()) return NOT_RUNNING;
  return invoke<HexStatus>('hex_status');
}

export function installedHexModels(status: HexStatus | undefined): HexModel[] {
  return status?.models.filter((m) => m.installed) ?? [];
}

/** User-facing message for a Hex refusal; anything else passes through. */
export function hexErrorMessage(error: unknown, model: string): string {
  if (!isCodedError<HexErrorPayload>(error)) return errorMessage(error);
  switch (error.code) {
    case 'not-running': return "Hex isn't running. Open Hex, then retry.";
    case 'not-installed': return "Hex isn't installed in Applications.";
    case 'unauthorized': return "Hex rejected Kasset's request. Restart Hex, then retry.";
    case 'model-not-ready': return `${model} isn't downloaded in Hex. Download it in Hex › Models.`;
    case 'busy': return 'Hex is busy. Retry when it\'s done.';
    case 'incompatible': return "This Hex version isn't supported. Update Hex.";
    default: return `Hex couldn't transcribe this audio (${error.detail ?? error.code}).`;
  }
}

/** The model Hex uses when none is chosen: its first downloaded one. */
export async function defaultHexModel(): Promise<string> {
  const first = installedHexModels(await getHexStatus())[0];
  if (!first) throw new Error("Hex isn't running or has no downloaded model. Open Hex, then retry.");
  return first.id;
}

/** Hex adapter: one WAV part to the running Hex app (Rust holds the token). */
export const hexTranscribePart: TranscribePart = async ({ wav, model }) => {
  try {
    const text = await invoke<string>('hex_transcribe', wav, {
      headers: { 'x-hex-model': model, 'x-hex-language': TRANSCRIPTION_CONFIG.language },
    });
    return { text: text.trim(), segments: [] };
  } catch (error: unknown) {
    throw new Error(hexErrorMessage(error, model), { cause: error });
  }
};
