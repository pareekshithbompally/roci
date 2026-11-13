import { transcribe } from 'ai';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGroq } from '@ai-sdk/groq';
import { createGoogle } from '@ai-sdk/google';
import { createDeepgram } from '@ai-sdk/deepgram';
import { createElevenLabs } from '@ai-sdk/elevenlabs';
import { getPlatformFetch } from '@services/platform-fetch';
import { VERBATIM_TRANSCRIBE_PROMPT } from '@core/ai/prompts/transcription.prompt';
import type { TranscriptionModel } from 'ai';

export type TranscriptionEngineId =
  | 'whisper-1'
  | 'gpt-4o-transcribe'
  | 'gpt-4o-transcribe-diarize'
  | 'groq-whisper'
  | 'deepgram'
  | 'elevenlabs'
  | 'gemini';

export interface TranscriptSegment {
  text: string;
  startSecond: number;
  endSecond: number;
  speaker?: string;
}

export interface TranscriptResult {
  text: string;
  segments: TranscriptSegment[];
}

interface Cred {
  apiKey: string;
  baseUrl?: string;
}

type Run = (audio: Uint8Array, cred: Cred) => Promise<TranscriptResult>;

export interface TranscriptionEngine {
  id: TranscriptionEngineId;
  label: string;
  providerId: string;
  run: Run;
}

const viaSDK = (model: (c: Cred) => TranscriptionModel): Run =>
  async (audio, c) => {
    const r = await transcribe({ model: model(c), audio });
    return {
      text: r.text,
      segments: r.segments.map((s) => ({
        text: s.text,
        startSecond: s.startSecond,
        endSecond: s.endSecond,
        speaker: (s as Record<string, unknown>).speaker as string | undefined,
      })),
    };
  };

const viaMultimodal = (modelId: string): Run =>
  async (audio, c) => {
    const fetch = getPlatformFetch();
    const r = await generateText({
      model: createGoogle({ apiKey: c.apiKey, fetch })(modelId),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'file', data: audio, mediaType: 'audio/wav' } as const,
            { type: 'text', text: VERBATIM_TRANSCRIBE_PROMPT } as const,
          ],
        },
      ],
    });
    return { text: r.text.trim(), segments: [] };
  };

export const ENGINES: Record<TranscriptionEngineId, TranscriptionEngine> = {
  'whisper-1': {
    id: 'whisper-1',
    label: 'OpenAI Whisper',
    providerId: 'openai',
    run: viaSDK((c) =>
      createOpenAI({ apiKey: c.apiKey, fetch: getPlatformFetch() }).transcription('whisper-1'),
    ),
  },
  'gpt-4o-transcribe': {
    id: 'gpt-4o-transcribe',
    label: 'OpenAI GPT-4o Transcribe',
    providerId: 'openai',
    run: viaSDK((c) =>
      createOpenAI({ apiKey: c.apiKey, fetch: getPlatformFetch() }).transcription('gpt-4o-transcribe'),
    ),
  },
  'gpt-4o-transcribe-diarize': {
    id: 'gpt-4o-transcribe-diarize',
    label: 'OpenAI GPT-4o Transcribe (Diarized)',
    providerId: 'openai',
    run: viaSDK((c) =>
      createOpenAI({ apiKey: c.apiKey, fetch: getPlatformFetch() }).transcription('gpt-4o-transcribe-diarize'),
    ),
  },
  'groq-whisper': {
    id: 'groq-whisper',
    label: 'Groq Whisper Large v3 Turbo',
    providerId: 'groq',
    run: viaSDK((c) =>
      createGroq({ apiKey: c.apiKey, fetch: getPlatformFetch() }).transcription('whisper-large-v3-turbo'),
    ),
  },
  'deepgram': {
    id: 'deepgram',
    label: 'Deepgram Nova-3 (diarized)',
    providerId: 'deepgram',
    run: viaSDK((c) => createDeepgram({ apiKey: c.apiKey }).transcription('nova-3')),
  },
  'elevenlabs': {
    id: 'elevenlabs',
    label: 'ElevenLabs Scribe v1',
    providerId: 'elevenlabs',
    run: viaSDK((c) => createElevenLabs({ apiKey: c.apiKey }).transcription('scribe_v1')),
  },
  'gemini': {
    id: 'gemini',
    label: 'Google Gemini (multimodal)',
    providerId: 'gemini',
    run: viaMultimodal('gemini-2.0-flash'),
  },
};
