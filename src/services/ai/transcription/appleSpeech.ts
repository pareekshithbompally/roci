/** Apple Speech (SpeechAnalyzer, macOS 26+) via the apple-intelligence plugin: status, error copy, adapter, live engine. */

import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { INTEGRATION_SETTINGS_PATH } from '@config/integrations.config';
import { appleIntelligence, isAppleError, type AppleSpeechStatus } from '@services/ai/apple/appleIntelligence.service';
import { transcribeNatively } from './native';
import type { TranscribePart } from './types';
import type { StreamingEngine } from './streaming';
import { errorMessage } from '@shared/utils/errors';

/** Ready to transcribe: available, allowed, and the language model downloaded. */
export function isAppleSpeechReady(status: AppleSpeechStatus | undefined): boolean {
  return !!status?.available && status.authorization === 'authorized' && status.installed;
}

/** What stands between Apple Speech and transcribing: the prompt (undecided), a denial, or the model download. */
export type AppleSpeechStep = 'ask' | 'denied' | 'download';

/** Apple Speech's next setup step; null when it's ready or this Mac doesn't have it. */
export function appleSpeechStep(status: AppleSpeechStatus | undefined): AppleSpeechStep | null {
  if (!status?.available || isAppleSpeechReady(status)) return null;
  if (status.authorization === 'not_determined') return 'ask';
  if (status.authorization !== 'authorized') return 'denied';
  return 'download';
}

const STEP_HINTS: Record<AppleSpeechStep, string> = {
  ask: 'Allow Speech Recognition',
  denied: 'Allow Speech Recognition',
  download: 'Download the English speech model',
};

/** The next step when Apple Speech can't run yet; null when ready. */
export function appleSpeechHint(status: AppleSpeechStatus | undefined): string | null {
  if (!status?.available) return 'Not available on this Mac';
  const step = appleSpeechStep(status);
  return step ? STEP_HINTS[step] : null;
}

export const getAppleSpeechStatus = (): Promise<AppleSpeechStatus> =>
  appleIntelligence.speechStatus(TRANSCRIPTION_CONFIG.language);

/** The system Speech Recognition prompt; only shows while undecided. */
export const requestAppleSpeechAccess = (): Promise<boolean> => appleIntelligence.speechRequestAccess();

/** Downloads the speech model for the transcription language. */
export const downloadAppleSpeechModel = (): Promise<void> => appleIntelligence.speechPrepare(TRANSCRIPTION_CONFIG.language);

/** Asks while undecided, then downloads the model; whether Apple Speech can transcribe afterwards (a denial stays). */
export async function prepareAppleSpeech(): Promise<boolean> {
  let status = await getAppleSpeechStatus();
  if (appleSpeechStep(status) === 'ask') {
    await requestAppleSpeechAccess();
    status = await getAppleSpeechStatus();
  }
  if (appleSpeechStep(status) === 'download') {
    await downloadAppleSpeechModel();
    status = await getAppleSpeechStatus();
  }
  return isAppleSpeechReady(status);
}

function appleSpeechErrorMessage(error: unknown): string {
  if (!isAppleError(error)) return errorMessage(error);
  switch (error.code) {
    case 'not-authorized': return `Speech Recognition is off for Roci. Allow it in ${INTEGRATION_SETTINGS_PATH.appleIntelligence}.`;
    case 'model-not-ready': return `The Apple speech model isn't downloaded. Download it in ${INTEGRATION_SETTINGS_PATH.appleIntelligence}.`;
    case 'unsupported-language': return 'Apple speech doesn\'t support this language.';
    case 'unavailable': return error.detail ?? 'Apple speech isn\'t available on this Mac.';
    default: return `Apple speech couldn't transcribe this audio (${error.detail ?? error.code}).`;
  }
}

function speechFailure(error: unknown): never {
  throw new Error(appleSpeechErrorMessage(error), { cause: error });
}

/** One WAV part → text with timestamps (Rust writes a temporary file for SpeechAnalyzer). */
export const appleSpeechTranscribePart: TranscribePart = ({ wav }) =>
  transcribeNatively('plugin:apple-intelligence|speech_transcribe', wav, { 'x-language': TRANSCRIPTION_CONFIG.language })
    .catch(speechFailure);

/** Streaming with Apple Speech: each stream is its own analyzer under its own id, so a meeting runs two (you and the call). */
export const appleSpeechStreaming: StreamingEngine = {
  concurrent: 2,
  async open({ language }) {
    // Random, not a counter: a webview reload would restart a counter while native streams live on.
    const [id] = crypto.getRandomValues(new Uint32Array(1));
    await appleIntelligence.speechLiveStart(id, language).catch(speechFailure);
    return {
      feed: (pcm) => appleIntelligence.speechLiveFeed(id, pcm).catch(speechFailure),
      finish: () => appleIntelligence.speechLiveFinish(id).catch(speechFailure),
      cancel: () => appleIntelligence.speechLiveCancel(id),
    };
  },
};
