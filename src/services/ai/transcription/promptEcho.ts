/** A Whisper-family model given silence and a context prompt may read the prompt back as the transcript; this drops such
 *  output (the same rule as the on-device engine's `drop_prompt_echo` in src-tauri/src/stt/vocabulary.rs). A prompt of one
 *  term is never dropped: a lone term is as likely to be what was said. */

import type { TranscriptResult } from './types';

const SEPARATORS = /[,;\n]/;
const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const EDGE_PUNCTUATION = /^[!-/:-@[-`{-~]+|[!-/:-@[-`{-~]+$/g;

/** Lowercased words without edge punctuation, digits spelled as numerals, list separators as spaces. */
function normalizeSpoken(text: string): string {
  return text
    .replace(new RegExp(SEPARATORS, 'g'), ' ')
    .split(/\s+/)
    .map((word) => word.replace(EDGE_PUNCTUATION, '').toLowerCase())
    .filter(Boolean)
    .map((word) => (DIGITS.includes(word) ? String(DIGITS.indexOf(word)) : word))
    .join(' ');
}

/** `result` without the segments (or the whole untimed text) that only read `prompt` back. */
export function withoutPromptEcho(result: TranscriptResult, prompt: string): TranscriptResult {
  if (prompt.split(SEPARATORS).filter((hint) => hint.trim()).length < 2) return result;
  const echo = normalizeSpoken(prompt);
  const echoes = (text: string) => normalizeSpoken(text) === echo;
  if (result.segments.length === 0) return echoes(result.text) ? { ...result, text: '', words: [] } : result;
  if (!result.segments.some((segment) => echoes(segment.text))) return result;
  const segments = result.segments.filter((segment) => !echoes(segment.text));
  return { ...result, segments, text: segments.map((segment) => segment.text.trim()).filter(Boolean).join(' ') };
}
