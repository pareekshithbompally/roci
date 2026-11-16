/** Copy and options each integration row shows; behaviour lives in features/integrations. */

/** Apple Notes folder in the default account; created on first save. */
const NOTES_FOLDER = 'Roci';

export const INTEGRATIONS_CONFIG = {
  calendar: {
    title: 'Calendar',
    description: 'Get notified before meetings and record them.',
    deniedHint: 'Roci is off in System Settings › Privacy & Security › Calendars.',
    /** Bundle id: the row shows the app's own icon from macOS. */
    app: 'com.apple.iCal',
  },
  appleIntelligence: {
    title: 'Apple Intelligence',
    description: 'On-device AI. Nothing leaves this device.',
    deniedHint: 'Apple Intelligence is off in System Settings › Apple Intelligence & Siri.',
    icon: '/images/apple-intelligence-sm.png',
    /** The welcome screen's third option: every basic job on Apple's models in one click. */
    onboarding: {
      description: 'Chat, summaries, speech and voice on this Mac. No keys, nothing leaves it',
      needsSettings: 'Turn on Apple Intelligence in System Settings, then come back',
    },
    /** Why the model can't run, per availability reason. */
    unavailable: {
      'device-not-eligible': 'This Mac doesn’t support Apple Intelligence.',
      'model-not-ready': 'The Apple Intelligence model is still downloading. Try again soon.',
      'unsupported-system': 'Requires macOS 26 or later.',
      unknown: 'Apple Intelligence is unavailable right now.',
    },
  },
  appleNotes: {
    title: 'Notes',
    description: `Save meetings to the “${NOTES_FOLDER}” folder.`,
    deniedHint: 'Roci is off in System Settings › Privacy & Security › Automation › Notes.',
    app: 'com.apple.Notes',
    folder: NOTES_FOLDER,
    /** Line at the end of each note that ties it to its meeting. */
    tagPrefix: 'Roci meeting',
  },
  spotlight: {
    title: 'Spotlight',
    description: 'Find meetings from Spotlight (⌘Space).',
    app: 'com.apple.Spotlight',
  },
  hex: {
    title: 'Hex',
    description: "Hex’s speech models and meetings in Roci.",
    app: 'anomaly.hex',
    /** Shown until Hex is installed. */
    icon: '/images/hex-app-sm.png',
    /** Catch-up on focus at most this often (a full read of Hex's meeting list). */
    focusSyncIntervalMs: 60_000,
  },
  reminders: {
    title: 'Reminders',
    description: 'Action items in Reminders, kept in sync.',
    deniedHint: 'Roci is off in System Settings › Privacy & Security › Reminders.',
    app: 'com.apple.reminders',
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
      description: 'Coding agents get Roci’s chat tools.',
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
