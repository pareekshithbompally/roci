/**
 * Meeting Index Repository
 * Manages meetings/index.json — lightweight entries for sidebar listing.
 */

import { IndexedRepository } from './indexed.repository';
import { pathsService } from '../storage/paths.service';
import type { MeetingIndexEntry } from '@shared/types';

class MeetingIndexRepository extends IndexedRepository<MeetingIndexEntry> {
  private initPromise: Promise<void> | null = null;

  constructor() {
    super(''); // path resolved lazily
  }

  /** Ensure initialized before any operation — deduplicates concurrent calls */
  private ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const base = await pathsService.getBasePath();
        const { join } = await import('@tauri-apps/api/path');
        const meetingsDir = await join(base, 'meetings');
        const { exists, mkdir } = await import('@tauri-apps/plugin-fs');
        const dirExists = await exists(meetingsDir);
        if (!dirExists) await mkdir(meetingsDir, { recursive: true });
        const indexPath = await join(meetingsDir, 'index.json');
        this.setIndexPath(indexPath);
      })();
    }
    return this.initPromise;
  }

  async loadIndex(): Promise<MeetingIndexEntry[]> {
    await this.ensureInit();
    return super.loadIndex();
  }

  async addToIndex(entry: MeetingIndexEntry): Promise<boolean> {
    await this.ensureInit();
    return super.addToIndex(entry);
  }

  async removeFromIndex(id: string): Promise<boolean> {
    await this.ensureInit();
    return super.removeFromIndex(id);
  }

  async updateInIndex(id: string, updates: Partial<MeetingIndexEntry>): Promise<boolean> {
    await this.ensureInit();
    return super.updateInIndex(id, { ...updates, updatedAt: new Date().toISOString() } as Partial<MeetingIndexEntry>);
  }

  async getFromIndex(id: string): Promise<MeetingIndexEntry | null> {
    await this.ensureInit();
    return super.getFromIndex(id);
  }
}

export const meetingIndexRepository = new MeetingIndexRepository();
