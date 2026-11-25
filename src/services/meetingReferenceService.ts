/** The meetings attached to a chat question (@ mentions, a meeting's own chat): read by id from roci.db with only the fields
 *  asked for, and written out for the model. */

import type { Note, ActionItem, NoteEntry, TodoEntry, MeetingSummary } from '@shared/types';
import { store } from '@services/db';
import { concurrencyMap } from '@shared/utils/async.utils';
import { excerptTranscript } from '@services/ai/transcription/excerpt';
import { IO_CONCURRENCY } from '@extensions/rag/constants';
import { MAX_TRANSCRIPT_FOR_LLM } from '@extensions/tools/constants';

/** A meeting with its full context for AI chat. */
export interface MeetingReference {
  id: string;
  title: string;
  timestamp: number;
  summary?: string;
  notes?: Note[];
  todos?: ActionItem[];
  categories?: string[];
  transcript?: string;
  /** A meeting being recorded now: the newest part of its transcript so far. */
  liveTranscript?: string;
}

export type MeetingField = 'summary' | 'actionItems' | 'notes' | 'transcript';

/** Lightweight meeting row for the mention popup. */
export interface MeetingListItem {
  id: string;
  title: string;
  timestamp: number;
}

const bullets = (heading: string, lines: string[]) => `${heading}:\n${lines.map((line) => `- ${line}`).join('\n')}`;

/** A meeting's summary as plain text for a model: overview, then each list that has entries. */
export function summaryText(summary: MeetingSummary): string {
  const parts: string[] = [];
  if (summary.overview) parts.push(summary.overview);
  if (summary.keyDiscussionPoints?.length) parts.push(bullets('Key Discussion Points', summary.keyDiscussionPoints));
  if (summary.decisionsMade?.length) parts.push(bullets('Decisions Made', summary.decisionsMade));
  if (summary.actionItems?.length) {
    parts.push(bullets('Action Items', summary.actionItems.map((a) => `${a.text}${a.owner ? ` (${a.owner})` : ''}${a.dueDate ? ` — due ${a.dueDate}` : ''}`)));
  }
  if (summary.nextSteps?.length) parts.push(bullets('Next Steps', summary.nextSteps));
  return parts.join('\n\n');
}

class MeetingReferenceService {
  /** The meetings by id with only the requested fields, to keep the chat's context small; one that's gone is left out. */
  async loadSelectiveContext(meetingIds: string[], fields: MeetingField[]): Promise<MeetingReference[]> {
    const want = new Set(fields);
    const details = await concurrencyMap(meetingIds, (id) => store.meetings.get(id), { limit: IO_CONCURRENCY });
    return details.flatMap((detail) => {
      if (!detail) return [];
      const ref: MeetingReference = {
        id: detail.index.id,
        title: detail.index.title,
        timestamp: new Date(detail.index.createdAt).getTime(),
        categories: detail.index.categories,
      };
      if (want.has('summary') && detail.summary) ref.summary = summaryText(detail.summary);
      if (want.has('transcript') && detail.transcript?.text) ref.transcript = detail.transcript.text;
      if (want.has('notes') && detail.notes.length > 0) {
        ref.notes = detail.notes.map((n: NoteEntry) => ({ id: n.id, text: n.text, timestamp: new Date(n.createdAt).getTime() }));
      }
      if (want.has('actionItems') && detail.todos.length > 0) {
        ref.todos = detail.todos.map((t: TodoEntry) => ({ id: t.id, text: t.text, dueDate: t.dueDate, completed: t.completed }));
      }
      return [ref];
    });
  }

  formatForLLM(references: MeetingReference[]): string {
    if (references.length === 0) return '';

    return references.map(ref => {
      const parts = [`## Meeting: ${ref.title}`];
      
      if (ref.summary) {
        parts.push(`### Summary\n${ref.summary}`);
      }

      if (ref.notes && ref.notes.length > 0) {
        const notesText = ref.notes.map(n => `- ${n.text}`).join('\n');
        parts.push(`### Notes\n${notesText}`);
      }

      if (ref.todos && ref.todos.length > 0) {
        const todosText = ref.todos.map(t => {
          const status = t.completed ? '✓' : '○';
          const due = t.dueDate ? ` (Due: ${t.dueDate})` : '';
          return `- ${status} ${t.text}${due}`;
        }).join('\n');
        parts.push(`### Action Items\n${todosText}`);
      }

      if (ref.transcript) {
        parts.push(`### Transcript\n${excerptTranscript(ref.transcript, MAX_TRANSCRIPT_FOR_LLM)}`);
      }

      if (ref.liveTranscript) {
        parts.push(`### Live transcript (recording now, meeting ID ${ref.id}; its newest part. For earlier parts, find in meetings with this meeting_id and a query, or read its transcript)\n${ref.liveTranscript}`);
      }

      return parts.join('\n\n');
    }).join('\n\n---\n\n');
  }
}

export const meetingReferenceService = new MeetingReferenceService();
