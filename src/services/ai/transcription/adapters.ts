/** One adapter per speech API family, each taking one 16 kHz mono WAV part and returning its text and segments. */

import { experimental_transcribe as transcribe, generateText } from 'ai';
import { createModel, createTranscriptionModel } from '@services/ai/provider';
import { extractTokenUsage } from '@services/ai/types';
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
  'openai-compatible': viaSDK((r) => createTranscriptionModel('openai-compatible', r)),
  deepgram: viaSDK((r) => createTranscriptionModel('deepgram', r)),
  elevenlabs: viaSDK((r) => createTranscriptionModel('elevenlabs', r)),
  multimodal: viaMultimodalPrompt,
  hex: hexTranscribePart,
  'apple-speech': appleSpeechTranscribePart,
  'on-device': onDeviceTranscribePart,
};
