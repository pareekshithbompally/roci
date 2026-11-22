/** Copy and options each integration row shows; behaviour lives in features/integrations. */

/** Apple Notes folder in the default account; created on first save. */
import { CalendarDays, ListChecks, Search, StickyNote } from 'lucide-react';
import { platform } from '@platform/index';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';

const NOTES_FOLDER = 'Roci';

/** Where an integration's switch lives; Apple Intelligence is a model source, so it sits with the providers. */
export const INTEGRATION_SETTINGS_PATH = { default: 'Settings › Integrations', appleIntelligence: `Settings › Providers › ${LOCAL_MODELS_CONFIG.provider.title}` } as const;

export const INTEGRATIONS_CONFIG = {
  calendar: {
    title: 'Calendar',
    description: 'Get notified before meetings and record them.',
    deniedHint: `Roci is off in ${platform.settingsAppName} › Privacy & Security › Calendars.`,
    /** Bundle id: the row shows the app's own icon from macOS; `symbol` on iPhone. */
    app: 'com.apple.iCal',
    symbol: CalendarDays,
  },
  appleIntelligence: {
    title: 'Apple Intelligence',
    description: 'On-device AI. Nothing leaves this device.',
    deniedHint: `Apple Intelligence is off in ${platform.settingsAppName} › Apple Intelligence & Siri.`,
    icon: '/images/apple-intelligence-sm.png',
    /** The welcome screen's third option: every basic job on Apple's models in one click. */
    onboarding: {
      needsSettings: `Turn it on in ${platform.settingsAppName}`,
    },
    /** Why the model can't run, per availability reason. */
    unavailable: {
      'device-not-eligible': `This ${platform.deviceName} doesn’t support Apple Intelligence.`,
      'model-not-ready': 'The Apple Intelligence model is still downloading. Try again soon.',
      'unsupported-system': `Requires ${platform.systemName} 26 or later.`,
      unknown: 'Apple Intelligence is unavailable right now.',
    },
  },
  appleNotes: {
    title: 'Notes',
    description: `Save meetings to the “${NOTES_FOLDER}” folder.`,
    deniedHint: 'Roci is off in System Settings › Privacy & Security › Automation › Notes.',
    app: 'com.apple.Notes',
    symbol: StickyNote,
    folder: NOTES_FOLDER,
    /** Line at the end of each note that ties it to its meeting. */
    tagPrefix: 'Roci meeting',
  },
  spotlight: {
    title: 'Spotlight',
    description: 'Find meetings from Spotlight (⌘Space).',
    app: 'com.apple.Spotlight',
    symbol: Search,
  },
  hex: {
    title: 'Hex',
    description: "Hex’s speech models and meetings in Roci. Deleting in Hex keeps Roci’s copy.",
    app: 'anomaly.hex',
    /** Shown until Hex is installed. */
    icon: '/images/hex-app-sm.png',
    /** Catch-up on focus at most this often (a full read of Hex's meeting list). */
    focusSyncIntervalMs: 60_000,
  },
  reminders: {
    title: 'Reminders',
    description: 'Action items in Reminders, kept in sync.',
    deniedHint: `Roci is off in ${platform.settingsAppName} › Privacy & Security › Reminders.`,
    app: 'com.apple.reminders',
    symbol: ListChecks,
    /** List created on first enable */
    defaultListTitle: 'Roci',
    /** Reminders fires several change notifications per edit; pull once they settle. */
    pullDebounceMs: 500,
  },
  /** Roci's tools in coding agents, through Roci's MCP server (`Roci mcp`). One card: server, agents, manual setup. */
  codingAgents: {
    section: 'Coding agents',
    server: {
      title: 'Roci MCP server',
      description: 'Coding agents get Roci’s MCP Server.',
      ready: 'Ready',
      starting: 'Starting',
      connected: (count: number) => `${count} ${count === 1 ? 'agent' : 'agents'} connected`,
    },
    /** Agent row description once Roci is added. */
    added: 'Added. Start a new session to use Roci’s tools.',
    outdated: {
      description: 'Added for a copy of Roci that has moved. Update to fix.',
      action: 'Update',
    },
    notInstalled: 'Not installed on this Mac.',
    manual: {
      title: 'Other agents',
      description: 'Add a local (stdio) MCP server named “roci” that runs:',
      copy: 'Copy command',
      copied: 'Command copied',
    },
    agents: {
      'claude-code': { title: 'Claude Code', description: 'Added with Claude Code’s own command, for every project.', icon: '/images/model-provider/anthropic.svg' },
      codex: { title: 'Codex', description: 'Added with Codex’s own command.', icon: '/images/model-provider/openai.svg' },
      opencode: { title: 'OpenCode', description: 'Adds one entry to OpenCode’s global config; nothing else changes.', icon: '/images/opencode-app-sm.png' },
    },
  },
  /** `roci://` links (src-tauri/src/url_actions.rs) for Shortcuts, Raycast, Alfred and notes. */
  urlActions: {
    section: 'URL actions',
    /** What the links are and where to use them. */
    footer:
      'Links that control Roci from other apps. Open one from Shortcuts, Raycast, Alfred, a note or a browser, and Roci does it without you switching to it. Click the copy button beside a link, then paste it wherever that app asks for a URL.',
    copy: 'Copy link',
    copied: 'Link copied',
    meetingNotFound: 'That meeting isn’t in Roci.',
    actions: [
      { url: 'roci://record', description: 'Start recording. The menu bar icon turns red.' },
      { url: 'roci://stop', description: 'Stop recording and transcribe.' },
      { url: 'roci://ask?q=', description: 'Ask in a new chat. Put the question after q=.' },
      { url: 'roci://meeting/<id>', description: 'Open a meeting by its ID.' },
      { url: 'roci://show', description: 'Bring up Roci.' },
      { url: 'roci://settings', description: 'Open Settings.' },
    ],
  },
} as const;
