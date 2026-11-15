/** Native file open/save dialogs with browser fallbacks. */

import { isTauriEnvironment } from './environment.service';
import type { FileDialogOptions, SaveDialogOptions } from './types';

class DialogService {
  /** @returns Selected file path(s), or null if cancelled */
  async open(options: FileDialogOptions = {}): Promise<string | string[] | null> {
    if (!isTauriEnvironment()) {
      return this.fallbackFileOpen(options.multiple);
    }

    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      return await open({
        title: options.title,
        defaultPath: options.defaultPath,
        filters: options.filters,
        multiple: options.multiple,
      });
    } catch (error) {
      console.error('Failed to open file dialog:', error);
      return null;
    }
  }

  /** @returns Selected save path, or null if cancelled */
  async save(options: SaveDialogOptions = {}): Promise<string | null> {
    if (!isTauriEnvironment()) {
      return this.fallbackFileSave(options.defaultPath);
    }

    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      return await save({
        title: options.title,
        defaultPath: options.defaultPath,
        filters: options.filters,
      });
    } catch (error) {
      console.error('Failed to open save dialog:', error);
      return null;
    }
  }

  async message(title: string, message: string): Promise<void> {
    if (!isTauriEnvironment()) {
      alert(`${title}\n\n${message}`);
      return;
    }

    try {
      const { message: showMessage } = await import('@tauri-apps/plugin-dialog');
      await showMessage(message, { title });
    } catch (error) {
      console.error('Failed to show message dialog:', error);
      alert(`${title}\n\n${message}`);
    }
  }

  async confirm(title: string, message: string): Promise<boolean> {
    if (!isTauriEnvironment()) {
      return confirm(`${title}\n\n${message}`);
    }

    try {
      const { ask } = await import('@tauri-apps/plugin-dialog');
      return await ask(message, { title });
    } catch (error) {
      console.error('Failed to show confirm dialog:', error);
      return confirm(`${title}\n\n${message}`);
    }
  }

  private fallbackFileOpen(multiple?: boolean): Promise<string | string[] | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = !!multiple;
      
      input.onchange = () => {
        if (input.files && input.files.length > 0) {
          if (multiple) {
            resolve(Array.from(input.files).map(f => f.name));
          } else {
            resolve(input.files[0].name);
          }
        } else {
          resolve(null);
        }
      };
      
      input.click();
    });
  }

  private fallbackFileSave(defaultPath?: string): Promise<string | null> {
    const filename = prompt('Enter filename:', defaultPath || 'recording');
    return Promise.resolve(filename);
  }
}

export const dialogService = new DialogService();
