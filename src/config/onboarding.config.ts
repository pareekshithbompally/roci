/** First-run flow copy and the icons it shows: welcome (no recording) or permissions (recording), then AI setup. */

import { Bell, CalendarDays, Cpu, Lock, Mic, Sparkles, SquareTerminal, Volume2, type LucideIcon } from 'lucide-react';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { platform } from '@platform/index';

/** System Settings panes ship as ExtensionKit bundles; Launch Services resolves apps by id but not these, so they go by path. */
const SETTINGS_PANES = '/System/Library/ExtensionKit/Extensions';

/** A row's icon: one macOS draws (an app's bundle id, or a settings pane's path), a bundled light/dark image, or a fan of provider logos. */
export type OnboardingIconSource =
  | { app: string; symbol: LucideIcon }
  | { glyph: string }
  | { image: { light: string; dark: string } }
  | { providers: readonly string[] };

/** macOS has no current microphone icon to draw, so that one is bundled in the same style (SF Symbol mic.fill on the icon tile). */
export const ONBOARDING_ICONS = {
  microphone: { image: { light: '/images/permission-microphone-light.png', dark: '/images/permission-microphone-dark.png' } },
  'system-audio': { app: `${SETTINGS_PANES}/Sound.appex`, symbol: Volume2 },
  notifications: { app: `${SETTINGS_PANES}/NotificationsSettings.appex`, symbol: Bell },
  calendar: { app: INTEGRATIONS_CONFIG.calendar.app, symbol: CalendarDays },
  // Apple Intelligence's own mark is a bare glyph: on a tile it weighs the same as the app icons beside it.
  appleIntelligence: { glyph: INTEGRATIONS_CONFIG.appleIntelligence.icon },
  local: { app: 'com.apple.Terminal', symbol: SquareTerminal },
  // This Mac's own hardware: System Information's icon.
  onDevice: { app: 'com.apple.SystemProfiler', symbol: Cpu },
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
  /** Devices that don't record: what Roci does; access is asked when a feature first needs it. */
  welcome: {
    heading: 'Welcome to Roci',
    features: [
      { icon: Sparkles, title: 'Your choice of AI', detail: 'Apple Intelligence, or your own key.' },
      { icon: Lock, title: 'Private', detail: `Chats stay on this ${platform.deviceName}.` },
      { icon: Mic, title: 'Talk or type', detail: 'Ask by voice or text, with photos and files.' },
    ],
  },
  /** Devices that record: what recording can't work without, asked up front; the rest is optional. */
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
      use: 'Use Apple Intelligence',
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
      none: `No server found on this ${platform.deviceName}.`,
      /** One by address: on this device over http, on another computer (over Tailscale) over https. */
      address: 'Server address',
      addressHint: 'The address of an OpenAI-compatible server, here or on another computer over Tailscale.',
      addressInvalid: platform.runsLocalServers
        ? 'Enter an address like http://localhost:11434.'
        : 'Enter an address like https://my-mac.tailnet.ts.net.',
      placeholder: platform.runsLocalServers ? 'http://localhost:11434' : 'https://my-mac.tailnet.ts.net',
    },
    /** Models downloaded to this device: a model for each job, downloaded on this screen. */
    onDevice: {
      title: `On this ${platform.deviceName}`,
      description: 'Private, free and offline',
      heading: `On this ${platform.deviceName}`,
      subtitle: `Runs privately on this ${platform.deviceName}. Nothing leaves it, nothing is charged.`,
      footer: (size: string) => `Downloads keep going if you leave. ${size} to download.`,
      ready: 'Every model is downloaded.',
      start: 'Download and Start',
      startReady: 'Start',
      downloading: (percent: number) => `Downloading… ${percent}%`,
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
    back: 'Back',
    use: 'Use',
    connect: 'Connect',
    openSettings: `Open ${platform.settingsAppName}`,
  },
  /** After onboarding, until AI is fully set up (home's button): a provider first, then the default models. */
  finishSetup: {
    start: 'Set up AI to start',
    defaults: (left: number) => `Choose default models · ${left} left`,
  },
} as const;
