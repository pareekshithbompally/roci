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

- \`summary\`: Full markdown summary using this EXACT structure:

## Meeting Overview
[2-3 sentence executive summary of what was discussed and main outcomes]

## Key Discussion Points
- [First major topic discussed with key details]
- [Second major topic with relevant context]
- [Additional topics as needed]

## Decisions Made
- [Decision 1 with context] (or state "No formal decisions were recorded" if none)
- [Decision 2 if applicable]

## Action Items
- [Specific task] - Owner: [Person name if mentioned] - Due: [Date if mentioned]
- [Additional action items]

## Next Steps
- [What happens next]
- [Follow-up items]

- \`categories\`: ${categoryInstruction}

- \`transcript\`: Complete verbatim transcription with timestamps in [MM:SS] format.
  - Every speaker change MUST have a timestamp
  - Use format: [MM:SS] Speaker Name: Text
  - Capture EVERY word spoken`;
}

export const TRANSCRIPTION_PROMPT = {
  build: buildTranscriptionPrompt,
};
