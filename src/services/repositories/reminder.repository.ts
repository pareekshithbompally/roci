/**
 * Reminder Repository
 * Manages the global reminders.json index at the app data root.
 * Avoids scanning all meeting directories on startup.
 */

import { BaseRepository } from './base.repository';
import { pathsService } from '../storage/paths.service';
import type { ReminderEntry } from '@shared/types';

class ReminderRepository extends BaseRepository {
  private filePath: string | null = null;
  private initPromise: Promise<void> | null = null;
  private cache: ReminderEntry[] | null = null;

  private ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const base = await pathsService.getBasePath();
        const { join } = await import('@tauri-apps/api/path');
        this.filePath = await join(base, 'reminders.json');
      })();
    }
    return this.initPromise;
  }

  async getAll(): Promise<ReminderEntry[]> {
    await this.ensureInit();
    if (this.cache) return this.cache;
    const data = await this.readJson<ReminderEntry[]>(this.filePath!);
    this.cache = data || [];
    return this.cache;
  }

  async getByTodoId(todoId: string): Promise<ReminderEntry | null> {
    const entries = await this.getAll();
    return entries.find(e => e.todoId === todoId && e.status === 'scheduled') ?? null;
  }

  async add(entry: ReminderEntry): Promise<boolean> {
    const entries = await this.getAll();
    // Remove any existing entry for this todo
    const filtered = entries.filter(e => e.todoId !== entry.todoId);
    filtered.push(entry);
    const ok = await this.writeJson(this.filePath!, filtered);
    if (ok) this.cache = filtered;
    return ok;
  }

  async remove(todoId: string): Promise<boolean> {
    const entries = await this.getAll();
    const filtered = entries.filter(e => e.todoId !== todoId);
    if (filtered.length === entries.length) return true; // Nothing to remove
    const ok = await this.writeJson(this.filePath!, filtered);
    if (ok) this.cache = filtered;
    return ok;
  }

  async updateStatus(todoId: string, status: ReminderEntry['status']): Promise<boolean> {
    const entries = await this.getAll();
    const idx = entries.findIndex(e => e.todoId === todoId);
    if (idx === -1) return false;
    entries[idx] = { ...entries[idx], status };
    const ok = await this.writeJson(this.filePath!, entries);
    if (ok) this.cache = entries;
    return ok;
  }

  async getScheduled(): Promise<ReminderEntry[]> {
    const entries = await this.getAll();
    return entries.filter(e => e.status === 'scheduled');
  }

  /** Remove entries that are fired/cancelled and older than the given age */
  async pruneStale(maxAgeMs: number): Promise<boolean> {
    const entries = await this.getAll();
    const cutoff = Date.now() - maxAgeMs;
    const kept = entries.filter(e => {
      if (e.status === 'scheduled') return true;
      return new Date(e.createdAt).getTime() > cutoff;
    });
    if (kept.length === entries.length) return true;
    const ok = await this.writeJson(this.filePath!, kept);
    if (ok) this.cache = kept;
    return ok;
  }

  clearCache(): void {
    this.cache = null;
  }
}

export const reminderRepository = new ReminderRepository();
