/** Meetings for chat @ mentions, with their summary, notes and todos from roci.db. */

import type { HistoryItem, Note, ActionItem, NoteEntry, TodoEntry } from '@shared/types';
import { store } from '@services/db';
import { concurrencyMap } from '@shared/utils/async.utils';
import { truncateForLLM } from '@shared/utils/text.utils';
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
}

export type MeetingField = 'summary' | 'actionItems' | 'notes' | 'transcript';

/** Lightweight meeting row for the mention popup. */
export interface MeetingListItem {
  id: string;
  title: string;
  timestamp: number;
}

class MeetingReferenceService {
  getRecentMeetings(historyItems: HistoryItem[], limit: number = 4): MeetingListItem[] {
    return historyItems
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map(item => ({
        id: item.id,
        title: item.title,
        timestamp: item.timestamp,
      }));
  }

  searchMeetings(historyItems: HistoryItem[], query: string): MeetingListItem[] {
    if (!query.trim()) {
      return this.getRecentMeetings(historyItems, 10);
    }

    const lowerQuery = query.toLowerCase();
    return historyItems
      .filter(item => item.title.toLowerCase().includes(lowerQuery))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10)
      .map(item => ({
        id: item.id,
        title: item.title,
        timestamp: item.timestamp,
      }));
  }

  /** Full context for a meeting: in-memory data on the history item first, else a store read. */
  async loadMeetingContext(historyItem: HistoryItem): Promise<MeetingReference> {
    const reference: MeetingReference = {
      id: historyItem.id,
      title: historyItem.title,
      timestamp: historyItem.timestamp,
      categories: historyItem.categories,
    };

    try {
      const detail = await store.meetings.get(historyItem.id);

      // Summary: prefer in-memory, fall back to store
      if (historyItem.summary) {
        reference.summary = historyItem.summary;
      } else if (detail?.summary) {
        const s = detail.summary;
        const parts: string[] = [];
        if (s.overview) parts.push(s.overview);
        if (s.keyDiscussionPoints?.length) {
          parts.push('Key Discussion Points:\n' + s.keyDiscussionPoints.map(p => `- ${p}`).join('\n'));
        }
        if (s.decisionsMade?.length) {
          parts.push('Decisions Made:\n' + s.decisionsMade.map(d => `- ${d}`).join('\n'));
        }
        if (s.actionItems?.length) {
          parts.push('Action Items:\n' + s.actionItems.map(a => {
            const owner = a.owner ? ` (${a.owner})` : '';
            const due = a.dueDate ? ` — due ${a.dueDate}` : '';
            return `- ${a.text}${owner}${due}`;
          }).join('\n'));
        }
        if (s.nextSteps?.length) {
          parts.push('Next Steps:\n' + s.nextSteps.map(s => `- ${s}`).join('\n'));
        }
        reference.summary = parts.join('\n\n');
      }

      // Transcript: prefer in-memory, fall back to store
      if (historyItem.transcript) {
        reference.transcript = historyItem.transcript;
      } else if (detail?.transcript?.text) {
        reference.transcript = detail.transcript.text;
      }

      if (detail?.notes && detail.notes.length > 0) {
        reference.notes = detail.notes.map((n: NoteEntry) => ({
          id: n.id,
          text: n.text,
          timestamp: new Date(n.createdAt).getTime(),
        }));
      }

      if (detail?.todos && detail.todos.length > 0) {
        reference.todos = detail.todos.map((t: TodoEntry) => ({
          id: t.id,
          text: t.text,
          dueDate: t.dueDate,
          completed: t.completed,
        }));
      }
    } catch (error) {
      console.error('[MeetingReferenceService] Error loading context:', error);
    }

    // Use inline notes/todos from history item if available
    if (!reference.notes && historyItem.userNotes) {
      reference.notes = historyItem.userNotes;
    }
    if (!reference.todos && historyItem.userActionItems) {
      reference.todos = historyItem.userActionItems;
    }

    return reference;
  }

  async loadMeetingsContext(historyItems: HistoryItem[]): Promise<MeetingReference[]> {
    return concurrencyMap(
      historyItems,
      (item) => this.loadMeetingContext(item),
      { limit: IO_CONCURRENCY },
    );
  }

  /** Meetings with only the requested fields, to keep agentic context small. */
  async loadSelectiveContext(
    historyItems: HistoryItem[],
    fields: MeetingField[]
  ): Promise<MeetingReference[]> {
    const fieldSet = new Set(fields);
    const references: MeetingReference[] = [];

    for (const item of historyItems) {
      const ref: MeetingReference = {
        id: item.id,
        title: item.title,
        timestamp: item.timestamp,
        categories: item.categories,
      };

      // Load full detail once if we need any store field
      let detail = null;
      try {
        if (fieldSet.has('summary') || fieldSet.has('transcript') || fieldSet.has('notes') || fieldSet.has('actionItems')) {
          detail = await store.meetings.get(item.id);
        }
      } catch (error) {
        console.error('[MeetingReferenceService] Error loading detail:', error);
      }

      if (fieldSet.has('summary')) {
        if (item.summary) {
          ref.summary = item.summary;
        } else if (detail?.summary) {
          const s = detail.summary;
          const parts: string[] = [];
          if (s.overview) parts.push(s.overview);
          if (s.keyDiscussionPoints?.length) {
            parts.push('Key Discussion Points:\n' + s.keyDiscussionPoints.map(p => `- ${p}`).join('\n'));
          }
          if (s.decisionsMade?.length) {
            parts.push('Decisions Made:\n' + s.decisionsMade.map(d => `- ${d}`).join('\n'));
          }
          if (s.actionItems?.length) {
            parts.push('Action Items:\n' + s.actionItems.map(a => {
              const owner = a.owner ? ` (${a.owner})` : '';
              const due = a.dueDate ? ` — due ${a.dueDate}` : '';
              return `- ${a.text}${owner}${due}`;
            }).join('\n'));
          }
          if (s.nextSteps?.length) {
            parts.push('Next Steps:\n' + s.nextSteps.map(s => `- ${s}`).join('\n'));
          }
          ref.summary = parts.join('\n\n');
        }
      }

      if (fieldSet.has('transcript')) {
        if (item.transcript) {
          ref.transcript = item.transcript;
        } else if (detail?.transcript?.text) {
          ref.transcript = detail.transcript.text;
        }
      }

      if (fieldSet.has('notes')) {
        if (detail?.notes && detail.notes.length > 0) {
          ref.notes = detail.notes.map((n: NoteEntry) => ({
            id: n.id,
            text: n.text,
            timestamp: new Date(n.createdAt).getTime(),
          }));
        }
      }

      if (fieldSet.has('actionItems')) {
        if (detail?.todos && detail.todos.length > 0) {
          ref.todos = detail.todos.map((t: TodoEntry) => ({
            id: t.id,
            text: t.text,
            dueDate: t.dueDate,
            completed: t.completed,
          }));
        }
      }

      // Fallback to inline data
      if (fieldSet.has('notes') && !ref.notes && item.userNotes) {
        ref.notes = item.userNotes;
      }
      if (fieldSet.has('actionItems') && !ref.todos && item.userActionItems) {
        ref.todos = item.userActionItems;
      }

      references.push(ref);
    }

    return references;
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
        parts.push(`### Transcript\n${truncateForLLM(ref.transcript, MAX_TRANSCRIPT_FOR_LLM)}`);
      }

      return parts.join('\n\n');
    }).join('\n\n---\n\n');
  }
}

export const meetingReferenceService = new MeetingReferenceService();
