/**
 * Transcription adapters — one per speech API family, all with the same shape:
 * one complete 16 kHz mono WAV part in, its text (and segments) out.
 *
 * - openai-compatible: OpenAI, Groq and any local server exposing
 *   `/audio/transcriptions` (Speaches, LocalAI, whisper servers); only the base URL differs.
 * - deepgram, elevenlabs: their AI SDK providers.
 * - multimodal: any audio-input model `createModel()` supports, prompted to transcribe.
 * - hex: the running Hex app (see hex.ts).
 * - apple-speech: Apple's on-device speech (see appleSpeech.ts).
 * - on-device: Kasset's own engine, transcribe.cpp in Rust (see onDevice.ts).
 */

import { experimental_transcribe as transcribe, generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createDeepgram } from '@ai-sdk/deepgram';
import { createElevenLabs } from '@ai-sdk/elevenlabs';
import { createModel } from '@services/ai/provider';
import { extractTokenUsage } from '@services/ai/types';
import { getPlatformFetch } from '@services/platform-fetch';
import { VERBATIM_TRANSCRIBE_PROMPT } from '@core/ai/prompts/transcription.prompt';
import { hexTranscribePart } from './hex';
import { appleSpeechTranscribePart } from './appleSpeech';
import { onDeviceTranscribePart } from './onDevice';
import type { TranscriptionAdapterId } from '@config/transcription.config';
import type { TranscriptionModel } from 'ai';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import type { PartRequest, TranscribePart, TranscriptResult } from './types';

/** Keyed adapters always receive a resolved model: the pipeline resolves one for every keyed provider. */
function resolvedOf(request: PartRequest): ResolvedModel {
  if (!request.resolved) throw new Error('This transcription provider needs credentials.');
  return request.resolved;
}

/** Any AI SDK transcription model → the shared result shape. */
const viaSDK = (modelFor: (resolved: ResolvedModel) => TranscriptionModel): TranscribePart =>
  async (request) => {
    const result = await transcribe({
      model: modelFor(resolvedOf(request)),
      audio: request.wav,
      abortSignal: request.signal,
    });
    return {
      text: result.text,
      segments: result.segments.map((s) => ({
        text: s.text,
        startSecond: s.startSecond,
        endSecond: s.endSecond,
        speaker: (s as Record<string, unknown>).speaker as string | undefined,
      })),
    };
  };

const viaMultimodalPrompt: TranscribePart = async (request): Promise<TranscriptResult> => {
  const result = await generateText({
    model: createModel(resolvedOf(request)),
    abortSignal: request.signal,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'file', data: request.wav, mediaType: 'audio/wav' } as const,
          { type: 'text', text: VERBATIM_TRANSCRIBE_PROMPT } as const,
        ],
      },
    ],
  });
  return { text: result.text.trim(), segments: [], usage: extractTokenUsage(result.usage) };
};

export const ADAPTERS: Record<TranscriptionAdapterId, TranscribePart> = {
  'openai-compatible': viaSDK((r) =>
    createOpenAI({ apiKey: r.apiKey, baseURL: r.baseUrl || undefined, fetch: getPlatformFetch() }).transcription(r.modelId),
  ),
  deepgram: viaSDK((r) => createDeepgram({ apiKey: r.apiKey, fetch: getPlatformFetch() }).transcription(r.modelId)),
  elevenlabs: viaSDK((r) => createElevenLabs({ apiKey: r.apiKey, fetch: getPlatformFetch() }).transcription(r.modelId)),
  multimodal: viaMultimodalPrompt,
  hex: hexTranscribePart,
  'apple-speech': appleSpeechTranscribePart,
  'on-device': onDeviceTranscribePart,
};
