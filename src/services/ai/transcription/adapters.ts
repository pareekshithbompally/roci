/**
 * Transcription adapters — one per speech API family, all with the same shape:
 * one complete 16 kHz mono WAV part in, its text (and segments) out.
 *
 * - openai-compatible: OpenAI, Groq and any local server exposing
 *   `/audio/transcriptions` (Speaches, LocalAI, whisper servers); only the base URL differs.
 * - deepgram, elevenlabs: their AI SDK providers.
 * - gemini: multimodal prompt (no transcription endpoint).
 * - hex: the running Hex app (see hex.ts).
 */

import { experimental_transcribe as transcribe, generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createDeepgram } from '@ai-sdk/deepgram';
import { createElevenLabs } from '@ai-sdk/elevenlabs';
import { getPlatformFetch } from '@services/platform-fetch';
import { VERBATIM_TRANSCRIBE_PROMPT } from '@core/ai/prompts/transcription.prompt';
import { hexTranscribePart } from './hex';
import { appleSpeechTranscribePart } from './appleSpeech';
import type { TranscriptionAdapterId } from '@config/transcription.config';
import type { TranscriptionModel } from 'ai';
import type { Cred } from './cred';
import type { PartRequest, TranscribePart, TranscriptResult } from './types';

/** Cloud adapters always receive credentials: the pipeline resolves them for every keyed provider. */
function credOf(request: PartRequest): Cred {
  if (!request.cred) throw new Error('This transcription provider needs credentials.');
  return request.cred;
}

/** Any AI SDK transcription model → the shared result shape. */
const viaSDK = (modelFor: (cred: Cred, model: string) => TranscriptionModel): TranscribePart =>
  async (request) => {
    const result = await transcribe({
      model: modelFor(credOf(request), request.model),
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

const viaGeminiPrompt: TranscribePart = async (request): Promise<TranscriptResult> => {
  const result = await generateText({
    model: createGoogleGenerativeAI({ apiKey: credOf(request).apiKey, fetch: getPlatformFetch() })(request.model),
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
  return { text: result.text.trim(), segments: [] };
};

export const ADAPTERS: Record<TranscriptionAdapterId, TranscribePart> = {
  'openai-compatible': viaSDK((cred, model) =>
    createOpenAI({ apiKey: cred.apiKey, baseURL: cred.baseUrl, fetch: getPlatformFetch() }).transcription(model),
  ),
  deepgram: viaSDK((cred, model) => createDeepgram({ apiKey: cred.apiKey }).transcription(model)),
  elevenlabs: viaSDK((cred, model) => createElevenLabs({ apiKey: cred.apiKey }).transcription(model)),
  gemini: viaGeminiPrompt,
  hex: hexTranscribePart,
  'apple-speech': appleSpeechTranscribePart,
};
