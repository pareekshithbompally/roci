/**
 * Fit a transcript to a model's context window (HEX `meeting/notes.rs` budget).
 * Only models that report a small window are trimmed; the rest get the whole
 * transcript. A long meeting keeps its opening and its end — where the agenda
 * and the conclusions are — joined by `[…]`.
 */

/** Characters per token for budgeting (HEX: 3). */
const CHARS_PER_TOKEN = 3;
/** Tokens kept free for the model's answer. */
const OUTPUT_TOKENS = 1_000;
/** The opening's share of an excerpt; the rest is the end. */
const HEAD_SHARE = 0.6;
export const GAP_MARKER = '\n[…]\n';

/** Characters of transcript that fit beside `instructions`; null when the window is unknown (no trimming). */
export function transcriptBudget(contextTokens: number | null, instructions: string): number | null {
  if (!contextTokens) return null;
  return Math.max(0, (contextTokens - OUTPUT_TOKENS) * CHARS_PER_TOKEN - instructions.length);
}

/** The transcript within `budget` characters: whole, or opening + `[…]` + end, cut on line breaks. */
export function excerptTranscript(transcript: string, budget: number | null): string {
  if (budget === null || transcript.length <= budget) return transcript;
  const room = Math.max(0, budget - GAP_MARKER.length);
  const head = transcript.slice(0, Math.floor(room * HEAD_SHARE));
  const tail = transcript.slice(transcript.length - (room - head.length));
  const headCut = head.lastIndexOf('\n');
  const tailCut = tail.indexOf('\n');
  return (headCut > 0 ? head.slice(0, headCut) : head) + GAP_MARKER + (tailCut >= 0 ? tail.slice(tailCut + 1) : tail);
}
