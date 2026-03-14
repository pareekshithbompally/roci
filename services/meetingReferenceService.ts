/**
 * Meeting Reference Service
 * 
 * Provides meeting data for @ mentions in chat.
 * Fetches meetings with their full context (summary, notes, todos).
 */

import type { HistoryItem, Note, ActionItem } from '@/types';
import { notesService, todosService, summariesService } from './storage';
import { isTauriEnvironment } from './tauri';

/**
 * Meeting reference with full context for AI chat
 */
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

/**
 * Lightweight meeting item for display in popup
 */
export interface MeetingListItem {
  id: string;
  title: string;
  timestamp: number;
}

class MeetingReferenceService {
  /**
   * Get recent meetings for popup display
   */
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

  /**
   * Search meetings by title
   */
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

  /**
   * Load full context for a meeting
   */
  async loadMeetingContext(historyItem: HistoryItem): Promise<MeetingReference> {
    const reference: MeetingReference = {
      id: historyItem.id,
      title: historyItem.title,
      timestamp: historyItem.timestamp,
      summary: historyItem.summary,
      categories: historyItem.categories,
    };

    // Load notes and todos if in Tauri environment
    if (isTauriEnvironment()) {
      try {
        const [notesResult, todosResult] = await Promise.all([
          notesService.getNotesForMeeting(historyItem.id),
          todosService.getTodosForMeeting(historyItem.id),
        ]);

        if (notesResult.success && notesResult.data) {
          reference.notes = notesResult.data.map(n => ({
            id: n.id,
            text: n.text,
            timestamp: n.timestamp,
          }));
        }

        if (todosResult.success && todosResult.data) {
          reference.todos = todosResult.data.map(t => ({
            id: t.id,
            text: t.text,
            dueDate: t.dueDate,
            completed: t.completed,
          }));
        }
      } catch (error) {
        console.error('[MeetingReferenceService] Error loading context:', error);
      }
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

  /**
   * Load context for multiple meetings
   */
  async loadMeetingsContext(historyItems: HistoryItem[]): Promise<MeetingReference[]> {
    return Promise.all(historyItems.map(item => this.loadMeetingContext(item)));
  }

  /**
   * Load meetings with only the requested fields.
   * Used by the agentic context pipeline to minimize token usage.
   */
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

      if (fieldSet.has('summary')) {
        ref.summary = item.summary;
      }

      if (fieldSet.has('transcript')) {
        ref.transcript = item.transcript;
      }

      if (fieldSet.has('notes') || fieldSet.has('actionItems')) {
        // Load from storage if in Tauri environment
        if (isTauriEnvironment()) {
          try {
            if (fieldSet.has('notes')) {
              const notesResult = await notesService.getNotesForMeeting(item.id);
              if (notesResult.success && notesResult.data) {
                ref.notes = notesResult.data.map(n => ({
                  id: n.id,
                  text: n.text,
                  timestamp: n.timestamp,
                }));
              }
            }
            if (fieldSet.has('actionItems')) {
              const todosResult = await todosService.getTodosForMeeting(item.id);
              if (todosResult.success && todosResult.data) {
                ref.todos = todosResult.data.map(t => ({
                  id: t.id,
                  text: t.text,
                  dueDate: t.dueDate,
                  completed: t.completed,
                }));
              }
            }
          } catch (error) {
            console.error('[MeetingReferenceService] Error loading selective context:', error);
          }
        }

        // Fallback to inline data
        if (fieldSet.has('notes') && !ref.notes && item.userNotes) {
          ref.notes = item.userNotes;
        }
        if (fieldSet.has('actionItems') && !ref.todos && item.userActionItems) {
          ref.todos = item.userActionItems;
        }
      }

      references.push(ref);
    }

    return references;
  }

  /**
   * Format meeting references for LLM context
   */
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
        parts.push(`### Transcript\n${ref.transcript}`);
      }

      return parts.join('\n\n');
    }).join('\n\n---\n\n');
  }
}

export const meetingReferenceService = new MeetingReferenceService();
