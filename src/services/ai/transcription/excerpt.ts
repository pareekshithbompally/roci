/** Fits a transcript to a known context window, keeping the opening and the end joined by `[…]`. */

import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { profileOf } from '@services/ai/models';
import { appleIntelligence } from '@services/ai/apple/appleIntelligence.service';
import { modalitiesService } from '@services/modalities';
import { getProviderType, type ResolvedModel } from '@shared/utils/modelResolver';

const { charsPerToken, outputTokens, headShare } = TRANSCRIPTION_CONFIG.summaryBudget;
export const GAP_MARKER = '\n[…]\n';

/** The model's context window in tokens: Apple's reported window, else the model catalog's; null when unknown. */
export async function contextTokensFor(resolved: ResolvedModel): Promise<number | null> {
  if (getProviderType(resolved.provider) === 'apple-intelligence') {
    return (await appleIntelligence.status()).contextTokens || null;
  }
  await modalitiesService.ensureLoaded();
  return profileOf(resolved.provider, resolved.model).contextTokens;
}

/** Characters of transcript that fit beside `instructions`; null when the window is unknown (no trimming). */
export function transcriptBudget(contextTokens: number | null, instructions: string): number | null {
  if (!contextTokens) return null;
  return Math.max(0, (contextTokens - outputTokens) * charsPerToken - instructions.length);
}

/** The transcript within `budget` characters: whole, or opening + `[…]` + end, cut on line breaks. */
export function excerptTranscript(transcript: string, budget: number | null): string {
  if (budget === null || transcript.length <= budget) return transcript;
  const room = Math.max(0, budget - GAP_MARKER.length);
  const head = transcript.slice(0, Math.floor(room * headShare));
  const tail = transcript.slice(transcript.length - (room - head.length));
  const headCut = head.lastIndexOf('\n');
  const tailCut = tail.indexOf('\n');
  return (headCut > 0 ? head.slice(0, headCut) : head) + GAP_MARKER + (tailCut >= 0 ? tail.slice(tailCut + 1) : tail);
}
