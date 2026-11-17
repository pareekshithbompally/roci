/** First-run flow copy and the icons it shows: welcome (no recording) or permissions (recording), then AI setup. */

import { Lock, MessageCircle, Sparkles } from 'lucide-react';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { platform } from '@platform/index';

/** System Settings panes ship as ExtensionKit bundles; Launch Services resolves apps by id but not these, so they go by path. */
const SETTINGS_PANES = '/System/Library/ExtensionKit/Extensions';

/** A row's icon: one macOS draws (an app's bundle id, or a settings pane's path), a bundled light/dark image, or a fan of provider logos. */
export type OnboardingIconSource =
  | { app: string }
  | { glyph: string }
  | { image: { light: string; dark: string } }
  | { providers: readonly string[] };

/** macOS has no current microphone icon to draw, so that one is bundled in the same style (SF Symbol mic.fill on the icon tile). */
export const ONBOARDING_ICONS = {
  microphone: { image: { light: '/images/permission-microphone-light.png', dark: '/images/permission-microphone-dark.png' } },
  'system-audio': { app: `${SETTINGS_PANES}/Sound.appex` },
  notifications: { app: `${SETTINGS_PANES}/NotificationsSettings.appex` },
  calendar: { app: 'com.apple.iCal' },
  // Apple Intelligence's own mark is a bare glyph: on a tile it weighs the same as the app icons beside it.
  appleIntelligence: { glyph: INTEGRATIONS_CONFIG.appleIntelligence.icon },
  local: { app: 'com.apple.Terminal' },
  remote: { providers: ['gemini', 'openai', 'anthropic'] },
} satisfies Record<string, OnboardingIconSource>;

export type OnboardingPermissionId = 'microphone' | 'system-audio' | 'notifications' | 'calendar';

export interface OnboardingPermissionCopy {
  title: string;
  /** Recording needs it; Continue waits for every required row. */
  required: boolean;
}

export const ONBOARDING_CONFIG = {
  /** Devices that don't record: what Roci does; access is asked when a feature first needs it. */
  welcome: {
    heading: 'Welcome to Roci',
    features: [
      { icon: MessageCircle, title: 'Ask anything', detail: 'Chat with the AI you choose, by typing or by voice.' },
      { icon: Sparkles, title: 'On device or with your key', detail: `Apple Intelligence runs on this ${platform.deviceName}, or connect a provider with your own key.` },
      { icon: Lock, title: 'Private by default', detail: `Your chats are saved on this ${platform.deviceName} only.` },
    ],
  },
  /** Devices that record: what recording can't work without, asked up front; the rest is optional. */
  permissions: {
    heading: 'Allow access',
    subheading: `Roci records your meetings on this ${platform.deviceName}.`,
    order: ['microphone', 'system-audio', 'notifications', 'calendar'] as const,
    rows: {
      microphone: { title: 'Microphone', required: true },
      'system-audio': { title: 'System audio', required: true },
      notifications: { title: 'Notifications', required: false },
      calendar: { title: 'Calendar', required: false },
    } satisfies Record<OnboardingPermissionId, OnboardingPermissionCopy>,
    required: { title: 'Needed to record', footer: 'The microphone records your voice; system audio records the other people on the call.' },
    optional: { title: 'Optional', footer: 'Notifications offer to record calls and remind you of meetings. Calendar names meetings and reminds you before they start.' },
  },
  setup: {
    heading: 'Choose your AI',
    /** The footer, one sentence per option shown, then the last line. */
    notes: {
      apple: `Apple Intelligence runs privately on this ${platform.deviceName}, with no keys.`,
      local: `A local server, such as Ollama or LM Studio, runs models on this ${platform.deviceName}.`,
      remote: 'An online provider, such as OpenAI, Anthropic or Google, uses your own API key.',
      change: 'You can change it any time in Settings.',
    },
    local: {
      title: 'Local server',
      heading: 'Connect a local server',
      scanning: 'Looking for servers…',
      none: 'No server found on this Mac. Enter its address below.',
      address: 'Server address',
      placeholder: 'http://localhost:11434',
    },
    remote: {
      title: 'Online provider',
    },
    checking: 'Checking…',
  },
  actions: {
    continue: 'Continue',
    later: 'Set up later',
    back: 'Back',
    use: 'Use',
    connect: 'Connect',
    openSettings: 'Open System Settings',
  },
} as const;
