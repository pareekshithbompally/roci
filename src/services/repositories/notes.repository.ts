/**
 * Notes Repository
 * Manages meetings/{id}/notes.json
 */

import { DocumentRepository } from './document.repository';
import { pathsService } from '../storage/paths.service';
import type { NoteEntry } from '@shared/types';

class NotesRepository extends DocumentRepository<NoteEntry[]> {
  private initPromise: Promise<void> | null = null;

  constructor() {
    super('', 'notes.json');
  }

  private ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const base = await pathsService.getBasePath();
        const { join } = await import('@tauri-apps/api/path');
        const meetingsDir = await join(base, 'meetings');
        this.setBasePath(meetingsDir);
      })();
    }
    return this.initPromise;
  }

  async readDoc(meetingId: string): Promise<NoteEntry[] | null> {
    await this.ensureInit();
    return super.readDoc(meetingId);
  }

  async writeDoc(meetingId: string, data: NoteEntry[]): Promise<boolean> {
    await this.ensureInit();
    return super.writeDoc(meetingId, data);
  }

  /** Add a note to a meeting */
  async addNote(meetingId: string, note: NoteEntry): Promise<boolean> {
    const notes = (await this.readDoc(meetingId)) || [];
    notes.push(note);
    return this.writeDoc(meetingId, notes);
  }

  /** Update a note */
  async updateNote(meetingId: string, noteId: string, text: string): Promise<boolean> {
    const notes = (await this.readDoc(meetingId)) || [];
    const idx = notes.findIndex(n => n.id === noteId);
    if (idx === -1) return false;
    notes[idx] = { ...notes[idx], text, updatedAt: new Date().toISOString() };
    return this.writeDoc(meetingId, notes);
  }

  /** Delete a note */
  async deleteNote(meetingId: string, noteId: string): Promise<boolean> {
    const notes = (await this.readDoc(meetingId)) || [];
    const filtered = notes.filter(n => n.id !== noteId);
    return this.writeDoc(meetingId, filtered);
  }
}

export const notesRepository = new NotesRepository();
