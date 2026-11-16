/** First-run flow copy: permissions, then AI setup. */

export type OnboardingPermissionId = 'microphone' | 'system-audio' | 'notifications' | 'calendar';

export interface OnboardingPermissionCopy {
  title: string;
  detail: string;
  /** `IconTile` tone. */
  tone: 'accent' | 'info' | 'danger' | 'success' | 'warning' | 'neutral';
  /** Recording needs it; Continue waits for every required row. */
  required: boolean;
}

export const ONBOARDING_CONFIG = {
  permissions: {
    heading: 'Roci needs your permission to record your meetings.',
    order: ['microphone', 'system-audio', 'notifications', 'calendar'] as const,
    rows: {
      microphone: { title: 'Microphone', detail: 'Records your voice', tone: 'accent', required: true },
      'system-audio': { title: 'System audio', detail: 'Records the other people on the call', tone: 'neutral', required: true },
      notifications: { title: 'Notifications', detail: 'Offers to record calls and reminds you of meetings', tone: 'danger', required: false },
      calendar: { title: 'Calendar', detail: 'Names meetings and reminds you before they start', tone: 'danger', required: false },
    } satisfies Record<OnboardingPermissionId, OnboardingPermissionCopy>,
    optional: 'Optional',
  },
  setup: {
    heading: 'Choose the AI Roci uses',
    subheading: 'For chat, summaries and transcripts. You can change it any time in Settings.',
    local: {
      title: 'Local',
      description: 'A server on this Mac or your network: Ollama, LM Studio, or any OpenAI-compatible address',
      heading: 'Connect a local server',
      scanning: 'Looking for servers…',
      none: 'No server found on this Mac. Enter its address below.',
      address: 'Server address',
      placeholder: 'http://localhost:11434',
    },
    remote: {
      title: 'Remote',
      description: 'OpenAI, Anthropic, Google and more, with your API key',
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
