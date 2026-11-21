/** One adapter per speech API family, each taking one 16 kHz mono WAV part and returning its text and segments. */

import { experimental_transcribe as transcribe, generateText } from 'ai';
import { createModel, createTranscriptionModel } from '@services/ai/provider';
import { extractTokenUsage } from '@services/ai/types';
import { verbatimTranscribePrompt } from '@core/ai/prompts/transcription.prompt';
import { hexTranscribePart } from './hex';
import { appleSpeechTranscribePart } from './appleSpeech';
import { onDeviceTranscribePart } from './onDevice';
import { SDK_SPEECH_FAMILIES, type SdkSpeechFamily, type TranscriptionAdapterId } from '@config/transcription.config';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import type { PartRequest, TranscribePart, TranscriptResult } from './types';
import { fileHints } from './vocabularyHints';
import { withoutPromptEcho } from './promptEcho';

/** Keyed adapters always receive a resolved model: the pipeline resolves one for every keyed provider. */
function resolvedOf(request: PartRequest): ResolvedModel {
  if (!request.resolved) throw new Error('This transcription provider needs credentials.');
  return request.resolved;
}

/** An AI SDK speech family's transcription model → the shared result shape, with the custom vocabulary as the family takes it. */
const viaSDK = (family: SdkSpeechFamily): TranscribePart =>
  async (request) => {
    const hints = fileHints(family, request.terms);
    const result = await transcribe({
      model: createTranscriptionModel(family, resolvedOf(request)),
      audio: request.wav,
      providerOptions: hints.providerOptions,
      abortSignal: request.signal,
    });
    const transcript: TranscriptResult = {
      text: result.text,
      segments: result.segments.map((s) => ({
        text: s.text,
        startSecond: s.startSecond,
        endSecond: s.endSecond,
        speaker: (s as Record<string, unknown>).speaker as string | undefined,
      })),
    };
    return hints.prompt ? withoutPromptEcho(transcript, hints.prompt) : transcript;
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
          { type: 'text', text: verbatimTranscribePrompt(request.terms) } as const,
        ],
      },
    ],
  });
  return { text: result.text.trim(), segments: [], usage: extractTokenUsage(result.usage) };
};

/** Every AI SDK speech family through the SDK; the rest through their own engine. */
export const ADAPTERS: Record<TranscriptionAdapterId, TranscribePart> = {
  ...(Object.fromEntries(SDK_SPEECH_FAMILIES.map((family) => [family, viaSDK(family)])) as Record<SdkSpeechFamily, TranscribePart>),
  multimodal: viaMultimodalPrompt,
  hex: hexTranscribePart,
  'apple-speech': appleSpeechTranscribePart,
  'on-device': onDeviceTranscribePart,
};
