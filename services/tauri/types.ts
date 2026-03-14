/**
 * Shared types for Tauri services
 */

export interface TauriEnvironment {
  isTauri: boolean;
  platform?: string;
  version?: string;
}

export interface FileDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: FileFilter[];
  multiple?: boolean;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: FileFilter[];
}

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
}

export enum TrayAction {
  SHOW = 'show',
  START_RECORDING = 'start_recording',
  STOP_RECORDING = 'stop_recording',
  QUIT = 'quit',
}
