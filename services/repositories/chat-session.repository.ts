/**
 * Chat Session Repository
 * Manages chats/{sessionId}.json — individual chat session files.
 */

import { BaseRepository } from './base.repository';
import { pathsService } from '../storage/paths.service';
import type { ChatMessage } from '@/types';

export interface StoredChatSession {
  id: string;
  title: string;
  lastMessageAt: number;
  messages: ChatMessage[];
}

class ChatSessionRepository extends BaseRepository {
  private initPromise: Promise<void> | null = null;
  private chatsDir: string = '';

  private ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const base = await pathsService.getBasePath();
        const { join } = await import('@tauri-apps/api/path');
        this.chatsDir = await join(base, 'chats');
        await this.ensureDir(this.chatsDir);
      })();
    }
    return this.initPromise;
  }

  private async getSessionPath(sessionId: string): Promise<string> {
    return this.joinPath(this.chatsDir, `${sessionId}.json`);
  }

  async loadSession(sessionId: string): Promise<StoredChatSession | null> {
    await this.ensureInit();
    const path = await this.getSessionPath(sessionId);
    return this.readJson<StoredChatSession>(path);
  }

  async saveSession(session: StoredChatSession): Promise<boolean> {
    await this.ensureInit();
    const path = await this.getSessionPath(session.id);
    return this.writeJson(path, session);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    await this.ensureInit();
    const path = await this.getSessionPath(sessionId);
    return this.deleteFile(path);
  }
}

export const chatSessionRepository = new ChatSessionRepository();
