/**
 * Recording Meta Repository
 * Manages meetings/{id}/recording.json
 */

import { DocumentRepository } from './document.repository';
import { pathsService } from '../storage/paths.service';
import type { RecordingMeta } from '@shared/types';

class RecordingMetaRepository extends DocumentRepository<RecordingMeta> {
  private initPromise: Promise<void> | null = null;

  constructor() {
    super('', 'recording.json');
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

  async readDoc(meetingId: string): Promise<RecordingMeta | null> {
    await this.ensureInit();
    return super.readDoc(meetingId);
  }

  async writeDoc(meetingId: string, data: RecordingMeta): Promise<boolean> {
    await this.ensureInit();
    return super.writeDoc(meetingId, data);
  }

  async deleteDoc(meetingId: string): Promise<boolean> {
    await this.ensureInit();
    return super.deleteDoc(meetingId);
  }
}

export const recordingMetaRepository = new RecordingMetaRepository();
