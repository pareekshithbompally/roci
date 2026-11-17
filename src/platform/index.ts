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
  /** Touch screen: iOS text sizes, 44 pt targets and larger glyphs (tokens.css `html.platform-ios`, kit icon scale). */
  hasTouchScreen: ios,
  /** How copy names this device, its system and its settings app ("this Mac", "macOS asks once", "System Settings › …"). */
  deviceName: mac ? 'Mac' : 'device',
  systemName: mac ? 'macOS' : ios ? 'iOS' : 'the system',
  settingsAppName: mac ? 'System Settings' : 'Settings',
  /** Traffic lights and a translucent window: the layout leaves room for them. */
  hasWindowChrome: mac,
  hasMenuBar: mac,
  hasGlobalShortcuts: mac,
  /** Self-updates from GitHub releases (iOS updates through the App Store). */
  hasUpdater: mac,
  /** Records meetings through the native audio core. */
  canRecord: mac,
  canCaptureSystemAudio: mac,
  canTakeScreenshots: mac,
  /** Notices when a call app (Zoom, Teams, Meet …) starts using the microphone. */
  hasCallDetection: mac,
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

/** A yes/no capability of this device, for data that names what it needs (`requires: 'hasCalendar'`). */
export type PlatformCapability = {
  [K in keyof typeof platform]: (typeof platform)[K] extends boolean ? K : never;
}[keyof typeof platform];
