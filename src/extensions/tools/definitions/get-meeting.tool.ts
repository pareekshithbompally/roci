/** get_meeting: chosen parts of one meeting (summary, notes, to-dos with their ids, transcript) from roci.db. */

import { z } from 'zod';
import type { MeetingCitation } from '@extensions/tools/types';
import { defineTool, idFrom, ok, toolDate } from '@extensions/tools/contract';
import { meetingNotFound, todoLine } from '@extensions/tools/data';
import { MAX_TRANSCRIPT_FOR_LLM } from '@extensions/tools/constants';
import { store } from '@services/db';
import { summaryText } from '@services/meetingReferenceService';
import { excerptTranscript } from '@services/ai/transcription/excerpt';
import type { MeetingDetail } from '@shared/types';

const PARTS = ['summary', 'notes', 'todos', 'transcript'] as const;
type Part = (typeof PARTS)[number];

const SECTIONS: Record<Part, (detail: MeetingDetail) => string | null> = {
  summary: (d) => (d.summary ? `### Summary\n${summaryText(d.summary)}` : null),
  notes: (d) => (d.notes.length > 0 ? `### Notes\n${d.notes.map((n) => `- ${n.text}`).join('\n')}` : null),
  todos: (d) => (d.todos.length > 0 ? `### To-dos\n${d.todos.map(todoLine).join('\n')}` : null),
  transcript: (d) => (d.transcript?.text ? `### Transcript\n${excerptTranscript(d.transcript.text, MAX_TRANSCRIPT_FOR_LLM)}` : null),
};

export const getMeetingTool = defineTool({
  name: 'get_meeting',
  description:
    "Read one meeting by its ID: its summary, the user's notes, its to-dos (with the ids update_todo and delete_todo " +
    'take) and, only when asked for, its transcript. Get the ID from search_meetings or list_meetings first.',
  input: z.object({
    meeting_id: idFrom('search_meetings or list_meetings'),
    parts: z
      .array(z.enum(PARTS))
      .min(1)
      .default(['summary', 'notes', 'todos'])
      .describe('Which parts to read. The transcript is long: ask for it only when the summary is not enough.'),
  }),

  async execute({ meeting_id, parts }) {
    const detail = await store.meetings.get(meeting_id);
    if (!detail) return meetingNotFound(meeting_id);

    const timestamp = Date.parse(detail.index.createdAt);
    const sections = [...new Set(parts)].map((part) => SECTIONS[part](detail)).filter((s): s is string => s !== null);
    const header = `## Meeting: ${detail.index.title}\n${toolDate(timestamp)} — ID: ${detail.index.id}`;
    const body = sections.length > 0 ? sections.join('\n\n') : `This meeting has no ${parts.join(' or ')} yet.`;
    const content = `${header}\n\n${body}`;

    // An explicit read: the meeting is a source of the answer.
    const citation: MeetingCitation = {
      meetingId: detail.index.id,
      meetingTitle: detail.index.title,
      meetingTimestamp: timestamp,
      excerpt: body.slice(0, 300),
      score: 1,
    };
    return ok(content, { resultCount: 1, citations: [citation] });
  },
});
