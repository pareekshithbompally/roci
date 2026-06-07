export interface MeetingContext {
  title: string;
  participants: Array<{ name?: string; email?: string }>;
  scheduledStart?: string;
}

export interface TranscriptionPromptOptions {
  categories: string[];
  meetingContext?: MeetingContext;
  temporalContext?: string;
}

export function buildTranscriptionPrompt(
  options: TranscriptionPromptOptions
): string {
  const { categories, meetingContext, temporalContext } = options;

  const categoryInstruction =
    categories.length > 0
      ? `Categorize into ONE OR MORE of: [${categories.join(', ')}]. Use ONLY these exact names.`
      : 'Categorize this meeting into appropriate categories based on the content.';

  const meetingContextBlock = meetingContext
    ? buildMeetingContextBlock(meetingContext)
    : '';

  const temporalBlock = temporalContext ? `\n${temporalContext}\n` : '';

  return `You are a meeting analyst. You are given the meeting transcript below. Analyze it. Do NOT reproduce the transcript.

IMPORTANT: Generate REAL content based on the transcript. Do NOT use placeholder or generic text.
${temporalBlock}${meetingContextBlock}
Your response is structured as JSON. Fill each field as described:

- \`title\`: Concise descriptive title (max 6 words) that captures the main topic.

- \`summary\`: A structured object with these fields:
  - \`overview\`: 2-3 sentence executive summary of what was discussed and main outcomes.
  - \`keyDiscussionPoints\`: Array of strings, each describing a major topic discussed with key details.
  - \`decisionsMade\`: Array of strings, each describing a decision made with context. If none, use ["No formal decisions were recorded"].
  - \`actionItems\`: Array of objects, each with \`text\` (required), \`owner\` (person name if mentioned in the meeting context), and \`dueDate\` (date if mentioned).
  - \`nextSteps\`: Array of strings describing follow-up items and what happens next.

- \`categories\`: ${categoryInstruction}`;
}

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

Use these participant names when attributing action-item owners — not for guessing transcript speakers.
If someone in the transcript says they'll do something, and they match a participant, use that participant's name as the owner.`;
}

export const VERBATIM_TRANSCRIBE_PROMPT =
  'Transcribe this audio exactly as spoken. Output only the transcript text — no labels, no timestamps, no commentary.';

export const TRANSCRIPTION_PROMPT = {
  build: buildTranscriptionPrompt,
};
