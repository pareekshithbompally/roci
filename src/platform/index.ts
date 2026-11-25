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
  /** Text follows the phone's Text Size setting (Dynamic Type), as native apps do (platform/dynamicType.ts). */
  followsTextSize: ios,
  /** Plays haptics (UIKit's feedback generators); a Mac has none for apps (platform/haptics.ts). */
  hasHaptics: ios,
  /** How copy names this device, its system and its settings app ("this Mac", "macOS asks once", "System Settings › …"). */
  deviceName: mac ? 'Mac' : 'device',
  systemName: mac ? 'macOS' : ios ? 'iOS' : 'the system',
  settingsAppName: mac ? 'System Settings' : 'Settings',
  /** Traffic lights and a translucent window: the layout leaves room for them. */
  hasWindowChrome: mac,
  hasMenuBar: mac,
  /** Its own system alert (native/alert.m): a sheet whose destructive button is red and takes no Return. */
  hasNativeAlert: mac,
  hasGlobalShortcuts: mac,
  /** Self-updates from GitHub releases (iOS updates through the App Store). */
  hasUpdater: mac,
  /** Records meetings through the native audio core (iPhone and iPad: the microphone, asked at the first Record). */
  canRecord: apple,
  canCaptureSystemAudio: mac,
  canTakeScreenshots: mac,
  /** Reads another app's icon by bundle id (NSWorkspace); iOS keeps apps' icons to themselves. */
  canReadAppIcons: mac,
  /** One audio session for the whole app: the web view's dictation mic would take it from a recording. */
  sharesAudioSession: ios,
  /** Notices when a call app (Zoom, Teams, Meet …) starts using the microphone. */
  hasCallDetection: mac,
  /** Runs inference servers itself (Ollama, LM Studio …), so their usual ports on this device are scanned; servers
   *  elsewhere (another Mac over Tailscale) are added by address on every platform. */
  runsLocalServers: mac,
  /** MCP servers: remote ones (Streamable HTTP) everywhere. */
  hasMcp: apple,
  /** MCP servers Roci launches as programs (stdio): iOS doesn't let apps start other programs. */
  canLaunchMcpServers: mac,
  /** Serves Roci's tools to coding agents over a local socket. */
  hasCodingAgents: mac,
  /** Downloads models and runs them on this device: llama.cpp (chat, search, voices) and transcribe.cpp (speech). */
  hasLocalModels: apple,
  /** Runs on-device chat, search and read aloud in llama.cpp's own server (llama-server, bundled; one process per model);
   *  iPhone and iPad run llama.cpp inside the app (iOS starts no other programs). */
  servesOnDeviceModels: mac,
  /** Stores models in a folder the user picks (e.g. a Hugging Face cache); iPhone and iPad keep Roci's own. */
  canChooseModelDirectory: mac,
  hasAppleIntelligence: apple,
  hasNotifications: apple,
  /** Reads calendars and reminders through EventKit (iPhone, iPad and Mac alike). */
  hasCalendar: apple,
  /** Notifies before calendar meetings with a Record action (timed natively; iPhone comes with its scheduled notices). */
  hasMeetingReminders: apple,
  /** Record / Join & Record from the calendar (the Mac; iPhone later). */
  canRecordFromCalendar: mac,
  hasSpotlight: mac,
  hasAppleNotes: mac,
  hasHex: mac,
  /** `roci://` links from Shortcuts, Raycast, notes. */
  hasUrlActions: mac,
  /** Reveal in Finder and open files in other apps. */
  hasFileManager: mac,
  /** Opens a specific System Settings pane (iOS gives apps no link to its Settings pages beyond their own). */
  canOpenSettingsPanes: mac,
} as const;

/** A yes/no capability of this device, for data that names what it needs (`requires: 'hasCalendar'`). */
export type PlatformCapability = {
  [K in keyof typeof platform]: (typeof platform)[K] extends boolean ? K : never;
}[keyof typeof platform];
