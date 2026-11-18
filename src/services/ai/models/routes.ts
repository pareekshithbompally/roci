/** How a record runs a job: the adapter chosen from what the model is, not from a curated list. */

import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import type { TranscriptionAdapterId } from '@config/transcription.config';
import { isLocalProviderId } from '@shared/utils/provider.utils';
import { fitsJob } from './records';
import type { ModelRecord } from './records';

type Routed = Pick<ModelRecord, 'provider' | 'input' | 'output'>;

/** Audio in, text out, nothing else: a dedicated speech-to-text model. */
export const isSpeechOnly = (r: Routed): boolean => r.input.length === 1 && r.output.length === 1 && fitsJob(r, 'transcribe');

function speechEndpointOf(provider: string): TranscriptionAdapterId | undefined {
  if (isLocalProviderId(provider)) return 'openai-compatible';
  return TRANSCRIPTION_CONFIG.speechEndpointByProvider[provider];
}

/** Speech-only models use their provider's speech endpoint when it has one; any other audio model is prompted. */
export function transcribeAdapter(record: Routed): TranscriptionAdapterId | null {
  if (!fitsJob(record, 'transcribe')) return null;
  const endpoint = speechEndpointOf(record.provider);
  return endpoint && isSpeechOnly(record) ? endpoint : 'multimodal';
}
