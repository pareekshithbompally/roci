/** The only place that knows the OS (R1): what this build runs on and what it can do. Features read flags, never `kind`. */

/** Tauri's target platform from Vite `define` (`darwin`, `ios`); empty in browser dev and tests. */
declare const __TAURI_PLATFORM__: string;

const target = typeof __TAURI_PLATFORM__ !== 'undefined' ? __TAURI_PLATFORM__ : '';
const mac = target === 'darwin';
const ios = target === 'ios';
const apple = mac || ios;

export type PlatformKind = 'macos' | 'ios' | 'browser';

export const platform = {
  kind: (mac ? 'macos' : ios ? 'ios' : 'browser') as PlatformKind,
  /** Traffic lights and a translucent window: the layout leaves room for them. */
  hasWindowChrome: mac,
  hasMenuBar: mac,
  hasGlobalShortcuts: mac,
  hasLaunchAtLogin: mac,
  /** Self-updates from GitHub releases (iOS updates through the App Store). */
  hasUpdater: mac,
  /** Records meetings through the native audio core. */
  canRecord: mac,
  canCaptureSystemAudio: mac,
  canTakeScreenshots: mac,
  /** Inference servers on this machine (Ollama, LM Studio …). */
  supportsLocalServers: mac,
  /** MCP servers launched as child processes. */
  supportsChildProcessMcp: mac,
  /** Serves Roci's tools to coding agents over a local socket. */
  hasCodingAgents: mac,
  /** On-device speech and voice models (transcribe.cpp, Phonon). */
  hasOnDeviceModels: mac,
  hasAppleIntelligence: apple,
  hasNotifications: apple,
  hasCalendar: mac,
  hasSpotlight: mac,
  hasAppleNotes: mac,
  hasHex: mac,
  /** `roci://` links from Shortcuts, Raycast, notes. */
  hasUrlActions: mac,
  /** Reveal in Finder and open files in other apps. */
  hasFileManager: mac,
} as const;
