/**
 * Transcription Prompt
 *
 * Single source of truth for the transcription/audio analysis prompt.
 * Schema enforcement handles structure; this prompt describes content expectations.
 */

export interface TranscriptionPromptOptions {
  categories: string[];
}

export function buildTranscriptionPrompt(
  options: TranscriptionPromptOptions
): string {
  const { categories } = options;

  const categoryInstruction =
    categories.length > 0
      ? `Categorize into ONE OR MORE of: [${categories.join(', ')}]. Use ONLY these exact names.`
      : 'Categorize this audio into appropriate categories based on the content.';

  return `You are a professional meeting analyst. Analyze this audio recording and provide a comprehensive summary.

IMPORTANT: Generate REAL content based on the actual audio. Do NOT use placeholder or generic text.

Your response is structured as JSON. Fill each field as described:

- \`title\`: Concise descriptive title (max 6 words) that captures the main topic.

- \`summary\`: A structured object with these fields:
  - \`overview\`: 2-3 sentence executive summary of what was discussed and main outcomes.
  - \`keyDiscussionPoints\`: Array of strings, each describing a major topic discussed with key details.
  - \`decisionsMade\`: Array of strings, each describing a decision made with context. If none, use ["No formal decisions were recorded"].
  - \`actionItems\`: Array of objects, each with \`text\` (required), \`owner\` (person name if mentioned), and \`dueDate\` (date if mentioned).
  - \`nextSteps\`: Array of strings describing follow-up items and what happens next.

- \`categories\`: ${categoryInstruction}

- \`transcript\`: Complete verbatim transcription with timestamps in [MM:SS] format.
  - Every speaker change MUST have a timestamp
  - Use format: [MM:SS] Speaker Name: Text
  - Capture EVERY word spoken`;
}

export const TRANSCRIPTION_PROMPT = {
  build: buildTranscriptionPrompt,
};
