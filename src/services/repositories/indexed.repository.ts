/**
 * IndexedRepository<T> — manages an index.json array.
 * In-memory cache after first load for fast reads.
 */

import { BaseRepository } from './base.repository';

export class IndexedRepository<T extends { id: string }> extends BaseRepository {
  private cache: T[] | null = null;
  private indexPath: string;

  constructor(indexPath: string) {
    super();
    this.indexPath = indexPath;
  }

  /** Get the index file path (resolved lazily) */
  getIndexPath(): string {
    return this.indexPath;
  }

  /** Set the resolved index path (called after path resolution) */
  setIndexPath(path: string): void {
    this.indexPath = path;
    this.cache = null;
  }

  async loadIndex(): Promise<T[]> {
    if (this.cache) return this.cache;
    const data = await this.readJson<T[]>(this.indexPath);
    this.cache = data || [];
    return this.cache;
  }

  async addToIndex(entry: T): Promise<boolean> {
    const items = await this.loadIndex();
    items.unshift(entry);
    const ok = await this.writeJson(this.indexPath, items);
    if (ok) this.cache = items;
    return ok;
  }

  async removeFromIndex(id: string): Promise<boolean> {
    const items = await this.loadIndex();
    const filtered = items.filter(item => item.id !== id);
    if (filtered.length === items.length) return true; // not found, no-op
    const ok = await this.writeJson(this.indexPath, filtered);
    if (ok) this.cache = filtered;
    return ok;
  }

  async updateInIndex(id: string, updates: Partial<T>): Promise<boolean> {
    const items = await this.loadIndex();
    const idx = items.findIndex(item => item.id === id);
    if (idx === -1) return false;
    items[idx] = { ...items[idx], ...updates };
    const ok = await this.writeJson(this.indexPath, items);
    if (ok) this.cache = items;
    return ok;
  }

  async getFromIndex(id: string): Promise<T | null> {
    const items = await this.loadIndex();
    return items.find(item => item.id === id) || null;
  }

  /** Clear the in-memory cache (forces re-read from disk) */
  clearCache(): void {
    this.cache = null;
  }
}
