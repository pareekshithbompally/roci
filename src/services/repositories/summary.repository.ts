/**
 * Summary Repository
 * Manages meetings/{id}/summary.json
 */

import { DocumentRepository } from './document.repository';
import { pathsService } from '../storage/paths.service';
import type { MeetingSummary } from '@shared/types';

class SummaryRepository extends DocumentRepository<MeetingSummary> {
  private initPromise: Promise<void> | null = null;

  constructor() {
    super('', 'summary.json');
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

  async readDoc(meetingId: string): Promise<MeetingSummary | null> {
    await this.ensureInit();
    return super.readDoc(meetingId);
  }

  async writeDoc(meetingId: string, data: MeetingSummary): Promise<boolean> {
    await this.ensureInit();
    return super.writeDoc(meetingId, data);
  }

  async deleteDoc(meetingId: string): Promise<boolean> {
    await this.ensureInit();
    return super.deleteDoc(meetingId);
  }
}

export const summaryRepository = new SummaryRepository();
