/**
 * Chat Index Repository
 * Manages chats/index.json — lightweight entries for sidebar listing.
 */

import { IndexedRepository } from './indexed.repository';
import { pathsService } from '../storage/paths.service';
import type { ChatIndexEntry } from '@/types';

class ChatIndexRepository extends IndexedRepository<ChatIndexEntry> {
  private initPromise: Promise<void> | null = null;

  constructor() {
    super('');
  }

  private ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const base = await pathsService.getBasePath();
        const { join } = await import('@tauri-apps/api/path');
        const chatsDir = await join(base, 'chats');
        const { exists, mkdir } = await import('@tauri-apps/plugin-fs');
        const dirExists = await exists(chatsDir);
        if (!dirExists) await mkdir(chatsDir, { recursive: true });
        const indexPath = await join(chatsDir, 'index.json');
        this.setIndexPath(indexPath);
      })();
    }
    return this.initPromise;
  }

  async loadIndex(): Promise<ChatIndexEntry[]> {
    await this.ensureInit();
    return super.loadIndex();
  }

  async addToIndex(entry: ChatIndexEntry): Promise<boolean> {
    await this.ensureInit();
    return super.addToIndex(entry);
  }

  async removeFromIndex(id: string): Promise<boolean> {
    await this.ensureInit();
    return super.removeFromIndex(id);
  }

  async updateInIndex(id: string, updates: Partial<ChatIndexEntry>): Promise<boolean> {
    await this.ensureInit();
    return super.updateInIndex(id, updates);
  }

  async getFromIndex(id: string): Promise<ChatIndexEntry | null> {
    await this.ensureInit();
    return super.getFromIndex(id);
  }
}

export const chatIndexRepository = new ChatIndexRepository();
