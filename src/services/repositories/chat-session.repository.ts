/**
 * Chat Session Repository
 * Manages chats/{sessionId}.json — individual chat session files.
 */

import { readDir } from '@tauri-apps/plugin-fs';
import { BaseRepository } from './base.repository';
import { pathsService } from '../storage/paths.service';
import { concurrencyMap } from '@shared/utils/async.utils';
import { IO_CONCURRENCY } from '@extensions/rag/constants';
import type { ChatMessage } from '@shared/types';

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

  async loadAllSessions(): Promise<StoredChatSession[]> {
    await this.ensureInit();

    try {
      const entries = await readDir(this.chatsDir);
      const sessionFiles = entries.filter((entry) => {
        if (entry.isDirectory) return false;
        return typeof entry.name === 'string'
          && entry.name.endsWith('.json')
          && entry.name !== 'index.json';
      });

      const sessions = await concurrencyMap(
        sessionFiles,
        async (entry) => {
          const fullPath = await this.joinPath(this.chatsDir, entry.name);
          return this.readJson<StoredChatSession>(fullPath);
        },
        { limit: IO_CONCURRENCY },
      );

      return sessions.filter((session): session is StoredChatSession => session !== null);
    } catch (error) {
      console.error('[ChatSessionRepository] Failed to load all sessions:', error);
      return [];
    }
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
