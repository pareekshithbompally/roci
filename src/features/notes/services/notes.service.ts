/**
 * Notes Service
 * 
 * Business logic layer for notes operations.
 * Wraps the storage service with validation.
 */

import { notesService as storageService } from '../../../../services/storage';

interface Note {
  id: string;
  text: string;
  timestamp?: number;
  meetingId: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface AddNoteResult {
  success: boolean;
  note?: Note;
  error?: string;
}

class NotesService {
  /**
   * Get notes for a meeting
   */
  async getNotesForMeeting(meetingId: string): Promise<Note[]> {
    const result = await storageService.getNotesForMeeting(meetingId);
    if (result.success && result.data) {
      return result.data.map(n => ({
        id: n.id,
        text: n.text,
        timestamp: n.timestamp,
        meetingId: n.meetingId,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        version: 1,
      }));
    }
    return [];
  }

  /**
   * Add a new note
   */
  async addNote(meetingId: string, text: string): Promise<AddNoteResult> {
    // Validate input
    if (!text.trim()) {
      return { success: false, error: 'Note text cannot be empty' };
    }

    if (!meetingId) {
      return { success: false, error: 'Meeting ID is required' };
    }

    const result = await storageService.addNote(meetingId, text.trim());
    
    if (result.success && result.data) {
      const note: Note = {
        id: result.data.id,
        text: result.data.text,
        timestamp: result.data.timestamp,
        meetingId: result.data.meetingId,
        createdAt: result.data.createdAt,
        updatedAt: result.data.updatedAt,
        version: 1,
      };

      return { success: true, note };
    }

    return { success: false, error: result.error || 'Failed to add note' };
  }

  /**
   * Update a note
   */
  async updateNote(meetingId: string, noteId: string, text: string): Promise<AddNoteResult> {
    // Validate input
    if (!text.trim()) {
      return { success: false, error: 'Note text cannot be empty' };
    }

    const result = await storageService.updateNote(meetingId, noteId, text.trim());
    
    if (result.success && result.data) {
      const note: Note = {
        id: result.data.id,
        text: result.data.text,
        timestamp: result.data.timestamp,
        meetingId: result.data.meetingId,
        createdAt: result.data.createdAt,
        updatedAt: result.data.updatedAt,
        version: 1,
      };

      return { success: true, note };
    }

    return { success: false, error: result.error || 'Failed to update note' };
  }

  /**
   * Delete a note
   */
  async deleteNote(meetingId: string, noteId: string): Promise<{ success: boolean; error?: string }> {
    const result = await storageService.deleteNote(meetingId, noteId);
    return result;
  }
}

// Singleton instance
export const notesFeatureService = new NotesService();
export default notesFeatureService;
