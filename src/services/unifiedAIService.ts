/** Thin AI orchestrator: transcribeAudio (STT) → analyzeTranscript (LLM); no provider-specific logic. */

import { integrationSettingsPath, isIntegrationEnabled } from '@shared/utils/integrations';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { AppSettings } from '@shared/types';
import { MAX_AUDIO_SIZE_BYTES, MAX_AUDIO_SIZE_MB, MIN_AUDIO_SIZE_BYTES, WAV_HEADER_SIZE_BYTES } from '@shared/utils/audio.utils';
import { recordUsage } from '@extensions/usage';
import { modalitiesService } from '@services/modalities';
import { requireSummaryModel } from '@services/ai/jobModel';
import { AiError, toAiError } from '@services/ai/errors';
import type { MeetingContext, UserNote } from '@core/ai/prompts/transcription.prompt';
import { store } from '@services/db';
import type { AnalysisResult } from '@core/ai/schemas/transcription.schema';
import {
  runTranscription,
  speechSelectionOf,
  analyzeTranscript,
  type SpeechSelection,
  type TranscribeOptions,
  type TranscriptResult,
} from './ai/transcription';

/** Which meeting a summary belongs to, and its calendar context. */
export interface SummaryOptions {
  meetingContext?: MeetingContext;
  /** The meeting id; usage rows are attributed to it. */
  meetingId?: string;
  /** Cancels the summary request. */
  signal?: AbortSignal;
}

/** A whole recording must hold real audio; a live chunk may be short (the tail at Stop) — only the size limit applies. */
const assertAudioSize = (blob: Blob, whole: boolean): void => {
  if (blob.size > MAX_AUDIO_SIZE_BYTES) {
    throw new Error(`Recording is too large (${(blob.size / (1024 * 1024)).toFixed(2)}MB). Limit is ${MAX_AUDIO_SIZE_MB}MB.`);
  }
  if (!whole) return;
  if (blob.size <= WAV_HEADER_SIZE_BYTES) {
    throw new Error('Recording contains no audio data — the file is empty. This usually means audio capture failed silently. Please check your audio permissions in System Settings → Privacy & Security → Screen & System Audio Recording and try again.');
  }
  if (blob.size < MIN_AUDIO_SIZE_BYTES) {
    throw new Error(`Recording is too short to process (${blob.size} bytes). Please ensure audio is being captured before stopping.`);
  }
};

/** The chosen speech model, when it can run: chosen, and its integration on — for recordings, live chunks and streams alike. */
export function readySpeechSelection(settings: AppSettings): SpeechSelection {
  const selection = speechSelectionOf(settings);
  if (!selection) throw new AiError('setup', 'Choose a transcription model in Settings › Default Models.');
  const integration = TRANSCRIPTION_CONFIG.integrationByProvider[selection.provider];
  if (integration && !isIntegrationEnabled(settings, integration)) {
    const name = getProviderTitle(selection.provider);
    throw new AiError('setup', `${name} is off in ${integrationSettingsPath(integration)}. Turn it on, or choose another transcription model.`);
  }
  return selection;
}

/** How a transcription is run: its cancel signal and progress, the meeting or dictation its usage row belongs to, and what silence means —
 *  an error for a whole recording (nothing to summarize), nothing at all for a live chunk (a pause in the meeting). */
export interface TranscribeAudioOptions extends TranscribeOptions {
  sessionId?: string;
  silence?: 'error' | 'empty';
}

/** The one way audio becomes text, for whole recordings and live chunks alike: checks the speech model is chosen and on,
 *  transcribes, and records usage; a failure reads as one plain sentence (the one AI error translator). */
export async function transcribeAudio(
  audioBlob: Blob,
  settings: AppSettings,
  providers: ModelProvider[],
  { sessionId, silence = 'error', ...options }: TranscribeAudioOptions = {},
): Promise<TranscriptResult> {
  const selection = readySpeechSelection(settings);
  assertAudioSize(audioBlob, silence === 'error');
  // An audio model chosen via models.dev resolves its adapter from the catalog.
  await modalitiesService.ensureLoaded();
  const result = await runTranscription(audioBlob, selection, providers, options).catch((error: unknown) => {
    throw toAiError(error, 'speech', selection.provider);
  });
  if (result.usage || result.audioSeconds) {
    recordUsage('transcription', { provider: selection.provider, modelId: selection.model }, result.usage, sessionId, result.audioSeconds);
  }
  // No speech in a whole recording is an error, so the analyzer can't invent a meeting from silence.
  if (silence === 'error' && !result.text.trim()) {
    throw new Error(TRANSCRIPTION_CONFIG.noSpeech);
  }
  return result;
}

/** The notes the user typed in a meeting, oldest first, for its summary. */
async function meetingNotesOldestFirst(meetingId: string): Promise<UserNote[]> {
  const notes = await store.notes.list(meetingId);
  return notes
    .map(({ text, createdAt }) => ({ text, createdAt }))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** A dictation's clip as text; its usage row carries the dictation's id. */
export async function audioToRawText(
  audioBlob: Blob,
  settings: AppSettings,
  providers: ModelProvider[],
  sessionId: string,
): Promise<string> {
  return (await transcribeAudio(audioBlob, settings, providers, { sessionId })).text;
}

class UnifiedAIService {
  /** A finished transcript → title, summary (with action items) and categories, from the Summary model. */
  async processTranscript(
    transcript: string,
    categories: string[],
    settings: AppSettings,
    providers: ModelProvider[],
    options: SummaryOptions = {},
  ): Promise<AnalysisResult> {
    const resolved = requireSummaryModel(settings, providers);
    const userNotes = options.meetingId ? await meetingNotesOldestFirst(options.meetingId) : undefined;
    return analyzeTranscript({ transcript, categories, resolved, userNotes, ...options });
  }

}

export const unifiedAIService = new UnifiedAIService();
