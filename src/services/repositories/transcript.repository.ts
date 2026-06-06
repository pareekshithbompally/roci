/**
 * Transcript Repository
 * Manages meetings/{id}/transcript.json
 */

import { DocumentRepository } from './document.repository';
import { pathsService } from '../storage/paths.service';
import type { TranscriptData } from '@shared/types';

class TranscriptRepository extends DocumentRepository<TranscriptData> {
  private initPromise: Promise<void> | null = null;

  constructor() {
    super('', 'transcript.json');
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

  async readDoc(meetingId: string): Promise<TranscriptData | null> {
    await this.ensureInit();
    return super.readDoc(meetingId);
  }

  async writeDoc(meetingId: string, data: TranscriptData): Promise<boolean> {
    await this.ensureInit();
    return super.writeDoc(meetingId, data);
  }

  async deleteDoc(meetingId: string): Promise<boolean> {
    await this.ensureInit();
    return super.deleteDoc(meetingId);
  }

  async deleteMeetingDir(meetingId: string): Promise<boolean> {
    await this.ensureInit();
    return super.deleteMeetingDir(meetingId);
  }
}

export const transcriptRepository = new TranscriptRepository();
