/** Live transcription, one spine: the chosen speech model either streams (words as they are said) or goes live in chunks
 *  (about eight seconds behind). `liveModeOf` is the one answer to "which"; dictation, meetings and Settings all ask it. */

import type { ModelProvider } from '@shared/types/modelProviders';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { adapterFor, type SpeechModelOption } from './catalog';
import { speechModelFor } from './pipeline';
import { STREAMING, type LiveStream } from './streaming';
import type { SpeechSelection } from './types';

export type LiveMode = 'streams' | 'chunks';

/** How `option` goes live with `streams` streams at once (dictation 1; a meeting 2 — you and the call). A model streams only
 *  when it can (`option.live`) and its engine runs that many streams; anything else goes live in chunks. */
export function liveModeOf(option: SpeechModelOption | undefined, providers: ModelProvider[], streams: number): LiveMode {
  if (!option?.live) return 'chunks';
  const engine = STREAMING[adapterFor(option, providers) ?? 'multimodal'];
  return engine && engine.concurrent >= streams ? 'streams' : 'chunks';
}

/** Opens a stream for a model `liveModeOf` said streams. */
export async function openLiveStream(selection: SpeechSelection, providers: ModelProvider[]): Promise<LiveStream> {
  const engine = STREAMING[adapterFor(selection, providers) ?? 'multimodal'];
  if (!engine) throw new Error(`${selection.model} doesn't stream.`);
  const { model, resolved } = await speechModelFor(selection, providers);
  return engine.open({ model, resolved, language: TRANSCRIPTION_CONFIG.language });
}
