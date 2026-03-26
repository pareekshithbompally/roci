/**
 * Client-side intent signal check.
 *
 * @deprecated Use `classifyIntent()` from `./intent-classifier` instead.
 * This heuristic-based approach has been replaced by LLM-based intent
 * classification in the orchestration rewrite. Kept for backward compatibility
 * with existing tests.
 */

const MEETING_SIGNALS: RegExp[] = [
  /\bmeeting/,
  /\bdiscuss/,
  /\baction items?\b/,
  /\btodos?\b/,
  /\bdecid/,
  /\bstandup\b/,
  /\bsync\b/,
  /\brecap\b/,
  /\bsummar/,
  /\btranscript/,
  /\blast (week|monday|tuesday|wednesday|thursday|friday|month|sprint)\b/,
  /\byesterday\b/,
  /\bwho (said|mentioned|brought|proposed|assigned)\b/,
  /\bwhat did (we|they|he|she|I|the team)\b/,
  /\bfollow.?up/,
  /\bassigned\b/,
  /\bdeadline/,
  /\bnext steps?\b/,
];

const GENERAL_SIGNALS: RegExp[] = [
  /^(hi|hello|hey|good (morning|afternoon|evening)|thanks|thank you|ok|okay)\b/,
  /^(what is|what'?s|what are|how (do|does|to|can)|explain|define|tell me about)\b/,
  /^(write|create|generate|make|build|code|calculate|solve|convert)\b/,
  /^(help|can you|could you|please)\b/,
];

/**
 * Returns true if the message likely needs meeting data retrieval.
 * Biased toward true — when in doubt, retrieve.
 */
export function needsRetrieval(userMessage: string, meetingCount: number): boolean {
  if (meetingCount === 0) return false;

  const msg = userMessage.toLowerCase().trim();

  if (msg.length < 5) return false;

  for (const pattern of MEETING_SIGNALS) {
    if (pattern.test(msg)) return true;
  }

  for (const pattern of GENERAL_SIGNALS) {
    if (pattern.test(msg)) return false;
  }

  return true;
}
