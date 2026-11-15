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
  MANAGE_MODELS = 'manage_models',
  SETTINGS = 'settings',
  CHECK_UPDATES = 'check_updates',
  QUIT = 'quit',
}

/**
 * Prefix of a Speech Model submenu item's id: `speech_model:<provider::model>`
 * (the speech selection key).
 * The model id is dynamic, so these arrive as plain strings, not enum members.
 */
export const SPEECH_MODEL_ACTION_PREFIX = 'speech_model:';

