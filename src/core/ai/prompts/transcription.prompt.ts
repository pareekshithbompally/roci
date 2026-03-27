/**
 * Transcription Prompt
 *
 * Single source of truth for the transcription/audio analysis prompt.
 * Schema enforcement handles structure; this prompt describes content expectations.
 */

/** Context from a linked calendar event, used to improve speaker attribution. */
export interface MeetingContext {
  title: string;
  participants: Array<{ name?: string; email?: string }>;
  scheduledStart?: string;
}

export interface TranscriptionPromptOptions {
  categories: string[];
  /** When provided, participant names are injected to improve speaker attribution. */
  meetingContext?: MeetingContext;
}

export function buildTranscriptionPrompt(
  options: TranscriptionPromptOptions
): string {
  const { categories, meetingContext } = options;

  const categoryInstruction =
    categories.length > 0
      ? `Categorize into ONE OR MORE of: [${categories.join(', ')}]. Use ONLY these exact names.`
      : 'Categorize this audio into appropriate categories based on the content.';

  const meetingContextBlock = meetingContext
    ? buildMeetingContextBlock(meetingContext)
    : '';

  return `You are a professional meeting analyst. Analyze this audio recording and provide a comprehensive summary.

IMPORTANT: Generate REAL content based on the actual audio. Do NOT use placeholder or generic text.
${meetingContextBlock}
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

/** Build the optional meeting context block for the prompt. */
function buildMeetingContextBlock(ctx: MeetingContext): string {
  const participantNames = ctx.participants
    .filter((p) => p.name || p.email)
    .map((p) => {
      if (p.name && p.email) return `${p.name} (${p.email})`;
      return p.name || p.email || '';
    })
    .filter(Boolean);

  if (participantNames.length === 0) return '';

  const timeInfo = ctx.scheduledStart
    ? `\n- Scheduled: ${new Date(ctx.scheduledStart).toLocaleString()}`
    : '';

  return `
MEETING CONTEXT (from calendar):
- Meeting: "${ctx.title}"${timeInfo}
- Participants: ${participantNames.join(', ')}

Use these participant names when attributing speakers in the transcript.
If you can match speakers by voice characteristics to the participant list,
use the participant's name (e.g., "[02:15] ${participantNames[0]}:") instead of
generic labels like "Speaker 1". If you cannot confidently match a voice,
use "Unknown Speaker" rather than guessing.
`;
}

export const TRANSCRIPTION_PROMPT = {
  build: buildTranscriptionPrompt,
};
