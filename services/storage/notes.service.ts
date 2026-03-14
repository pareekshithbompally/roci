/**
 * Notes Storage Service
 * Manages user notes persistence - per-meeting file approach
 */

import { writeFile, readFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { pathsService } from './paths.service';
import type { StorageResult } from './types';

export interface StoredNote {
  id: string;
  text: string;
  timestamp: number;
  meetingId: string;
  createdAt: string;
  updatedAt: string;
}

interface NotesFile {
  notes: StoredNote[];
}

class NotesService {
  /**
   * Get notes file path for a meeting
   */
  private async getFilePath(meetingId: string): Promise<string> {
    const path = await pathsService.getNotesPath();
    return `${path}${meetingId}.json`;
  }

  /**
   * Load notes for a meeting
   */
  async getNotesForMeeting(meetingId: string): Promise<StorageResult<StoredNote[]>> {
    try {
      const path = await this.getFilePath(meetingId);
      const fileExists = await exists(path);

      if (!fileExists) {
        return { success: true, data: [] };
      }

      const data = await readFile(path);
      const notesFile = JSON.parse(new TextDecoder().decode(data)) as NotesFile;
      return { success: true, data: notesFile.notes || [] };
    } catch (error) {
      console.error('[NotesService] Failed to load notes:', error);
      return { success: true, data: [] };
    }
  }

  /**
   * Save notes for a meeting
   */
  private async saveNotes(meetingId: string, notes: StoredNote[]): Promise<StorageResult> {
    try {
      const path = await this.getFilePath(meetingId);
      console.log('[NotesService] Saving notes to:', path);

      // Ensure directory exists
      const dirPath = (await pathsService.getNotesPath()).replace(/\/$/, '');
      const dirExists = await exists(dirPath);
      if (!dirExists) {
        await mkdir(dirPath, { recursive: true });
      }

      const notesFile: NotesFile = { notes };
      await writeFile(
        path,
        new TextEncoder().encode(JSON.stringify(notesFile, null, 2))
      );

      console.log('[NotesService] ✓ Saved notes');
      return { success: true };
    } catch (error) {
      console.error('[NotesService] ❌ Failed to save notes:', error);
      return { success: false, error: `Failed to save notes: ${error}` };
    }
  }

  /**
   * Add a note
   */
  async addNote(meetingId: string, text: string): Promise<StorageResult<StoredNote>> {
    console.log('[NotesService] Adding note for meeting:', meetingId);

    const result = await this.getNotesForMeeting(meetingId);
    const notes = result.data || [];

    const newNote: StoredNote = {
      id: crypto.randomUUID(),
      text,
      timestamp: Date.now(),
      meetingId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    notes.push(newNote);

    const saveResult = await this.saveNotes(meetingId, notes);
    if (!saveResult.success) {
      console.error('[NotesService] ✗ Failed to save note:', saveResult.error);
      return { success: false, error: saveResult.error };
    }

    console.log('[NotesService] ✓ Note saved successfully:', newNote.id);
    return { success: true, data: newNote };
  }

  /**
   * Update a note
   */
  async updateNote(meetingId: string, noteId: string, text: string): Promise<StorageResult<StoredNote>> {
    const result = await this.getNotesForMeeting(meetingId);
    const notes = result.data || [];

    const noteIndex = notes.findIndex(n => n.id === noteId);
    if (noteIndex === -1) {
      return { success: false, error: 'Note not found' };
    }

    notes[noteIndex] = {
      ...notes[noteIndex],
      text,
      updatedAt: new Date().toISOString(),
    };

    const saveResult = await this.saveNotes(meetingId, notes);
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    return { success: true, data: notes[noteIndex] };
  }

  /**
   * Delete a note
   */
  async deleteNote(meetingId: string, noteId: string): Promise<StorageResult> {
    const result = await this.getNotesForMeeting(meetingId);
    const notes = result.data || [];

    const filteredNotes = notes.filter(n => n.id !== noteId);
    return await this.saveNotes(meetingId, filteredNotes);
  }

  clearCache(): void {
    // No-op for now, can implement caching later if needed
  }
}

export const notesService = new NotesService();
