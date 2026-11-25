/** First-run flow copy and the icons it shows: welcome, permissions (the Mac), then AI setup. */

import { Bell, CalendarDays, SquareTerminal, Volume2, type LucideIcon } from 'lucide-react';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { IMAGE_GENERATION_CONFIG } from '@config/imageGeneration.config';
import { READ_ALOUD_CONFIG } from '@config/readAloud.config';
import { platform } from '@platform/index';

/** System Settings panes ship as ExtensionKit bundles; Launch Services resolves apps by id but not these, so they go by path. */
const SETTINGS_PANES = '/System/Library/ExtensionKit/Extensions';

/** A bundled image in its light and dark forms (one file when it reads on both). */
export interface ThemedImage {
  light: string;
  dark: string;
}

/** A row's icon: one macOS draws (an app's bundle id, or a settings pane's path), a bundled light/dark image, or a fan of
 *  provider logos or of the on-device engines' logos. */
export type OnboardingIconSource =
  | { app: string; symbol: LucideIcon; art?: string }
  | { glyph: string }
  | { image: ThemedImage }
  | { providers: readonly string[] }
  | { engines: readonly (ThemedImage & { name: string })[] };

const GGML_LOGO = '/images/model-provider/llama-cpp.png';

/** macOS has no current microphone icon to draw, so that one is bundled in the same style (SF Symbol mic.fill on the icon tile). */
export const ONBOARDING_ICONS = {
  microphone: { image: { light: '/images/permission-microphone-light.png', dark: '/images/permission-microphone-dark.png' } },
  'system-audio': { app: `${SETTINGS_PANES}/Sound.appex`, symbol: Volume2 },
  notifications: { app: `${SETTINGS_PANES}/NotificationsSettings.appex`, symbol: Bell },
  calendar: { app: INTEGRATIONS_CONFIG.calendar.app, symbol: CalendarDays },
  // Apple Intelligence's own mark is a bare glyph: on a tile it weighs the same as the app icons beside it.
  appleIntelligence: { glyph: INTEGRATIONS_CONFIG.appleIntelligence.icon },
  // iPhone can't read the Terminal's icon: the bundled server art stands in (docs/design/pane-icons).
  local: { app: 'com.apple.Terminal', symbol: SquareTerminal, art: 'server' },
  // The engine models run on here: ggml, through llama.cpp (chat, voices, search) and transcribe.cpp (speech recognition).
  onDevice: {
    engines: [{ name: 'llama.cpp', light: GGML_LOGO, dark: GGML_LOGO }],
  },
  remote: { providers: ['gemini', 'openai', 'anthropic'] },
} satisfies Record<string, OnboardingIconSource>;

export type OnboardingPermissionId = 'microphone' | 'system-audio' | 'notifications' | 'calendar';

export interface OnboardingPermissionCopy {
  title: string;
  /** What it's for, one sentence; a section's footer is the sentences of the rows it shows. */
  why: string;
  /** Recording needs it; Continue waits for every required row. */
  required: boolean;
}

export const ONBOARDING_CONFIG = {
  /** The first screen: what Roci does. */
  welcome: {
    heading: 'Welcome to Roci',
    features: [
      { art: 'welcome-choice', title: 'Your choice of AI', detail: 'Apple Intelligence, or your own key.' },
      { art: 'welcome-private', title: 'Private', detail: `Chats stay on this ${platform.deviceName}.` },
      { art: 'welcome-talk', title: 'Talk or type', detail: 'Ask by voice or text, with photos and files.' },
    ],
  },
  /** The Mac: what recording can't work without, asked up front; iPhone and iPad ask when a feature first needs it. */
  permissions: {
    heading: 'Allow access',
    subheading: `Roci records your meetings on this ${platform.deviceName}.`,
    order: ['microphone', 'system-audio', 'notifications', 'calendar'] as const,
    rows: {
      microphone: { title: 'Microphone', why: 'The microphone records your voice.', required: true },
      'system-audio': { title: 'System audio', why: 'System audio records the other people on the call.', required: true },
      notifications: { title: 'Notifications', why: 'Notifications offer to record calls and remind you of meetings.', required: false },
      calendar: { title: 'Calendar', why: 'Calendar names meetings and reminds you before they start.', required: false },
    } satisfies Record<OnboardingPermissionId, OnboardingPermissionCopy>,
    required: { title: 'Needed to record' },
    optional: { title: 'Optional' },
  },
  setup: {
    heading: 'Choose your AI',
    footer: 'You can change this in Settings.',
    /** Apple Intelligence's own step: its state, and the way to use it. */
    apple: {
      ready: 'Runs privately on this device. No key needed.',
      needsSettings: platform.canOpenSettingsPanes
        ? `Turn it on in ${platform.settingsAppName}, then come back.`
        : 'Turn it on in Settings › Apple Intelligence & Siri, then come back.',
    },
    /** The online providers' step: pick one, then its key. */
    providers: {
      footer: 'Each uses your own API key.',
    },
    /** One short line under each option: what it needs. */
    appleDetail: `On this ${platform.deviceName}, no key`,
    local: {
      title: 'Your server',
      description: 'Ollama, LM Studio, llama-server and others',
      heading: 'Connect your server',
      /** The servers already running on a device that runs them, each with Use. */
      found: `Found on this ${platform.deviceName}`,
      scanning: 'Looking for servers…',
      connected: 'Connected',
      connectedTo: (address: string) => `Connected to ${address}.`,
      none: `No server found on this ${platform.deviceName}.`,
      /** One by address: on this device over http, on another computer (over Tailscale) over https. */
      address: 'Server address',
      addressHint: 'The address of an OpenAI-compatible server, here or on another computer over Tailscale.',
      addressInvalid: platform.runsLocalServers
        ? 'Enter an address like http://localhost:11434.'
        : 'Enter an address like https://my-mac.tailnet.ts.net.',
      placeholder: platform.runsLocalServers ? 'http://localhost:11434' : 'https://my-mac.tailnet.ts.net',
    },
    /** Models downloaded to this device, in the background once accepted. */
    onDevice: {
      title: `On this ${platform.deviceName}`,
      description: 'Private, free and offline',
      subtitle: `Private and offline. Nothing leaves this ${platform.deviceName}, nothing is charged.`,
      size: (size: string) => `${size} to download. It carries on while you use Roci.`,
      noSpace: (size: string) => `Not enough space: these need ${size} free.`,
      unavailable: `Models can’t run on this ${platform.deviceName}.`,
    },
    /** What a connected provider offers, read-only; changed later in Settings. */
    defaults: {
      title: 'Defaults',
      accept: 'Go with Defaults',
      footer: 'You can change these in Settings › Default Models.',
      noChat: 'No default available: no chat model Roci can start with was found.',
      deviceVoice: READ_ALOUD_CONFIG.system.label,
      off: IMAGE_GENERATION_CONFIG.off.label,
      notSetUp: 'Not set up',
    },
    remote: {
      title: 'Online provider',
      description: 'Uses your API key',
    },
    checking: 'Checking…',
  },
  actions: {
    continue: 'Continue',
    later: 'Set up later',
    notNow: 'Not now',
    cancel: 'Cancel',
    use: 'Use',
    connect: 'Connect',
    retry: 'Try Again',
    openSettings: `Open ${platform.settingsAppName}`,
  },
  /** Settings couldn't be read: shown in place of the app. */
  loadError: 'Roci couldn’t read its data',
  /** After onboarding, until AI is fully set up (home's button): a provider first, then the default models. */
  finishSetup: {
    start: 'Set up AI to start',
    /** Chat's model on this device stopped before it finished downloading. */
    resume: (name: string) => `Finish downloading ${name}`,
    defaults: (left: number) => `Choose default models · ${left} left`,
    /** Chat's model on this device still downloading (onboarding opened the app before it finished). */
    downloading: (name: string, percent: number | null) => `Getting chat ready · ${name}${percent === null ? '' : ` · ${percent}%`}`,
  },
} as const;
