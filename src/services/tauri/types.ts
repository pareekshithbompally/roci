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

/** Menu bar actions the webview carries out (`menubar::item` in Rust; Rust handles the window, next-meeting and recent-meeting rows). */
export enum TrayAction {
  SHOW = 'show',
  START_RECORDING = 'start_recording',
  STOP_RECORDING = 'stop_recording',
  PAUSE_RECORDING = 'pause_recording',
  RESUME_RECORDING = 'resume_recording',
  MANAGE_MODELS = 'manage_models',
  MANAGE_AGENTS = 'manage_agents',
  NEW_CHAT = 'new_chat',
  SEARCH = 'search',
  SETTINGS = 'settings',
  CHECK_UPDATES = 'check_updates',
  INSTALL_UPDATE = 'install_update',
  QUIT = 'quit',
}

/** Speech Model menu item id prefix (`speech_model:<provider::model>`); dynamic, so not an enum member. */
export const SPEECH_MODEL_ACTION_PREFIX = 'speech_model:';


/** One entry of a menu shown by the system (or as an action sheet on a phone). */
export type MenuEntry =
  | { type: 'item'; label: string; onSelect: () => void; disabled?: boolean; /** Red on a phone's action sheet. */ destructive?: boolean }
  | { type: 'check'; label: string; checked: boolean; onSelect: () => void; disabled?: boolean }
  | { type: 'label'; label: string; /** A logo beside it (an image URL), on a Mac's menu only. */ icon?: string }
  | { type: 'separator' }
  | { type: 'submenu'; label: string; items: MenuEntry[] };
