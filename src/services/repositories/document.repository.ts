/**
 * DocumentRepository<T> — reads/writes files under meetings/{meetingId}/.
 * Auto-creates meeting subdirectory on write.
 */

import { remove } from '@tauri-apps/plugin-fs';
import { BaseRepository } from './base.repository';

export class DocumentRepository<T> extends BaseRepository {
  private meetingsBasePath: string;
  private filename: string;

  constructor(meetingsBasePath: string, filename: string) {
    super();
    this.meetingsBasePath = meetingsBasePath;
    this.filename = filename;
  }

  /** Set the resolved meetings base path */
  setBasePath(path: string): void {
    this.meetingsBasePath = path;
  }

  getBasePath(): string {
    return this.meetingsBasePath;
  }

  /** Get the full path for a document file */
  async getDocPath(meetingId: string): Promise<string> {
    return this.joinPath(this.meetingsBasePath, meetingId, this.filename);
  }

  /** Get the meeting directory path */
  async getMeetingDir(meetingId: string): Promise<string> {
    return this.joinPath(this.meetingsBasePath, meetingId);
  }

  async readDoc(meetingId: string): Promise<T | null> {
    const path = await this.getDocPath(meetingId);
    return this.readJson<T>(path);
  }

  async writeDoc(meetingId: string, data: T): Promise<boolean> {
    const dir = await this.getMeetingDir(meetingId);
    await this.ensureDir(dir);
    const path = await this.getDocPath(meetingId);
    return this.writeJson(path, data);
  }

  async deleteDoc(meetingId: string): Promise<boolean> {
    const path = await this.getDocPath(meetingId);
    return this.deleteFile(path);
  }

  async deleteMeetingDir(meetingId: string): Promise<boolean> {
    try {
      const dir = await this.getMeetingDir(meetingId);
      const dirExists = await this.fileExists(dir);
      if (!dirExists) return true;
      await remove(dir, { recursive: true });
      return true;
    } catch (error) {
      console.error(`[DocumentRepository] deleteMeetingDir failed: ${meetingId}`, error);
      return false;
    }
  }
}
