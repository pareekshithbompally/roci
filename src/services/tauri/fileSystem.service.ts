/** Native file operations with error handling. */

import { isTauriEnvironment } from './environment.service';

class FileSystemService {
  async writeFile(path: string, data: Uint8Array | ArrayBuffer): Promise<void> {
    if (!isTauriEnvironment()) {
      this.fallbackDownload(path, data);
      return;
    }

    try {
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      const uint8Array = data instanceof Uint8Array ? data : new Uint8Array(data);
      await writeFile(path, uint8Array);
    } catch (error) {
      console.error('Failed to write file:', error);
      throw new Error(`Failed to save file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    if (!isTauriEnvironment()) {
      this.fallbackDownloadText(path, content);
      return;
    }

    try {
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      await writeTextFile(path, content);
    } catch (error) {
      console.error('Failed to write text file:', error);
      throw new Error(`Failed to save file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async readFile(path: string): Promise<Uint8Array> {
    if (!isTauriEnvironment()) {
      throw new Error('File reading not supported in browser mode');
    }

    try {
      const { readFile } = await import('@tauri-apps/plugin-fs');
      return await readFile(path);
    } catch (error) {
      console.error('Failed to read file:', error);
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async readTextFile(path: string): Promise<string> {
    if (!isTauriEnvironment()) {
      throw new Error('File reading not supported in browser mode');
    }

    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      return await readTextFile(path);
    } catch (error) {
      console.error('Failed to read text file:', error);
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async exists(path: string): Promise<boolean> {
    if (!isTauriEnvironment()) {
      return false;
    }

    try {
      const { exists } = await import('@tauri-apps/plugin-fs');
      return await exists(path);
    } catch (error) {
      console.error('Failed to check file existence:', error);
      return false;
    }
  }

  private fallbackDownload(filename: string, data: Uint8Array | ArrayBuffer): void {
    const blob = new Blob([data]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private fallbackDownloadText(filename: string, content: string): void {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export const fileSystemService = new FileSystemService();
