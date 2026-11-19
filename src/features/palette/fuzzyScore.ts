/** The palette's scorer (ported from frappe/helpdesk): prefix beats word-start beats mid-word beats scattered letters. */

import type { PaletteCommand } from './paletteTypes';

const NO_MATCH = -1;
const PREFIX_SCORE = 1000;
const SUBSTRING_SCORE = 900;
const WORD_START_BONUS = 60;
const MAX_OFFSET_PENALTY = 100;
const SCATTERED_SCORE = 400;
const STREAK_BONUS = 20;
const MAX_GAP_PENALTY = 200;
/** Every substring hit scores at least this; scattered letters never do. */
const SUBSTRING_FLOOR = 800;
/** A visible-title match always beats the same match in keywords or the subtitle. */
const KEYWORD_PENALTY = 50;
const SUBTITLE_PENALTY = 100;

/** Prefix beats substring beats scattered subsequence; -1 means no match, 0 for an empty term. */
export function fuzzyScore(text: string, term: string): number {
  if (!term) return 0;
  const haystack = (text ?? '').toLowerCase();
  const needle = term.toLowerCase();

  const direct = haystack.indexOf(needle);
  if (direct === 0) return PREFIX_SCORE;
  if (direct > 0) {
    const onWordStart = /[\s\-_#/]/.test(haystack[direct - 1] ?? '');
    return SUBSTRING_SCORE - Math.min(direct, MAX_OFFSET_PENALTY) + (onWordStart ? WORD_START_BONUS : 0);
  }
  return scatteredScore(haystack, needle);
}

/** Every letter in order, rewarding runs and punishing gaps. */
function scatteredScore(haystack: string, needle: string): number {
  let position = 0;
  let streak = 0;
  let longestStreak = 0;
  let gaps = 0;
  for (const char of needle) {
    const found = haystack.indexOf(char, position);
    if (found === -1) return NO_MATCH;
    if (found === position && position > 0) streak += 1;
    else {
      gaps += found - position;
      streak = 0;
    }
    longestStreak = Math.max(longestStreak, streak);
    position = found + 1;
  }
  return SCATTERED_SCORE + longestStreak * STREAK_BONUS - Math.min(gaps, MAX_GAP_PENALTY);
}

/** Best of title, keywords and subtitle (each at its penalty), times the weight; a fixed rank wins outright. */
export function scoreCommand(command: PaletteCommand, term: string): number {
  if (command.rank !== undefined) return command.rank;
  if (!term) return 0;
  const base = Math.max(
    fuzzyScore(command.title, term),
    command.keywords ? fuzzyScore(command.keywords, term) - KEYWORD_PENALTY : NO_MATCH,
    command.subtitle ? fuzzyScore(command.subtitle, term) - SUBTITLE_PENALTY : NO_MATCH,
  );
  if (base < 0) return NO_MATCH;
  // A row hidden until typed needs a real substring: scattered letters would un-hide whole lists at once.
  if (command.hideWhenEmpty && base < SUBSTRING_FLOOR) return NO_MATCH;
  return base * (command.weight ?? 1);
}
