/**
 * Hex engine — transcribes through the running Hex app (src-tauri/src/hex_stt).
 *
 * Orchestration lives here: convert to 16 kHz mono, split into parts Hex
 * accepts, send them one by one with progress and cancellation between parts.
 * Rust holds Hex's token and does one HTTP call per part.
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '@services/tauri';
import { HEX_CONFIG } from '@config/hex.config';
import { encodeWavInt16, splitSamples, toMonoSamples } from '@shared/utils/wav.utils';
import type { Run, TranscriptSegment } from './engines';

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
  code: 'not-running' | 'incompatible' | 'unauthorized' | 'model-not-ready' | 'busy' | 'too-large' | 'rejected';
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

function isHexError(error: unknown): error is HexErrorPayload {
  return typeof error === 'object' && error !== null && 'code' in error;
}

/** User-facing message for a Hex refusal; anything else passes through. */
export function hexErrorMessage(error: unknown, model: string): string {
  if (!isHexError(error)) return error instanceof Error ? error.message : String(error);
  switch (error.code) {
    case 'not-running': return "Hex isn't running. Open Hex, then retry.";
    case 'unauthorized': return "Hex rejected Kasset's request. Restart Hex, then retry.";
    case 'model-not-ready': return `${model} isn't downloaded in Hex. Download it in Hex › Models.`;
    case 'busy': return 'Hex is busy. Retry when it\'s done.';
    case 'incompatible': return "This Hex version isn't supported. Update Hex.";
    default: return `Hex couldn't transcribe this audio (${error.detail ?? error.code}).`;
  }
}

async function resolveModel(modelId: string | undefined): Promise<string> {
  if (modelId) return modelId;
  const first = installedHexModels(await getHexStatus())[0];
  if (!first) throw new Error("Hex isn't running or has no downloaded model. Open Hex, then retry.");
  return first.id;
}

async function transcribePart(part: Float32Array, model: string): Promise<string> {
  const wav = encodeWavInt16(part, HEX_CONFIG.sampleRate);
  try {
    return await invoke<string>('hex_transcribe', wav, {
      headers: { 'x-hex-model': model, 'x-hex-language': HEX_CONFIG.language },
    });
  } catch (error: unknown) {
    throw new Error(hexErrorMessage(error, model), { cause: error });
  }
}

export const viaHex: Run = async (audio, { signal, onProgress, modelId }) => {
  const model = await resolveModel(modelId);
  const samples = await toMonoSamples(audio, HEX_CONFIG.sampleRate);
  const parts = splitSamples(samples, HEX_CONFIG.chunkSeconds * HEX_CONFIG.sampleRate);
  const duration = samples.length / HEX_CONFIG.sampleRate;
  const segments: TranscriptSegment[] = [];

  for (const [index, part] of parts.entries()) {
    signal?.throwIfAborted();
    onProgress?.({ current: index + 1, total: parts.length });
    const startSecond = index * HEX_CONFIG.chunkSeconds;
    segments.push({
      text: (await transcribePart(part, model)).trim(),
      startSecond,
      endSecond: Math.min(startSecond + HEX_CONFIG.chunkSeconds, duration),
    });
  }

  return { text: segments.map((s) => s.text).join('\n\n'), segments };
};
