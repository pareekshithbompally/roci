/**
 * Integrations — the copy and options each integration row shows.
 * Behaviour lives in features/integrations; this is presentation data only.
 */

/** Apple Notes folder in the default account; created on first save. */
const NOTES_FOLDER = 'Kasset';

export const INTEGRATIONS_CONFIG = {
  calendar: {
    title: 'Calendar',
    description: 'Get notified before meetings and record them. Works with every account in macOS Calendar.',
    deniedHint: 'Kasset is off in System Settings › Privacy & Security › Calendars.',
    icon: '/images/macos-calendar-sm.png',
  },
  appleIntelligence: {
    title: 'Apple Intelligence',
    description: 'Adds Apple Intelligence to Summaries and Apple Speech to Speech recognition in Settings › Capabilities. Nothing leaves your Mac.',
    deniedHint: 'Apple Intelligence is off in System Settings › Apple Intelligence & Siri.',
    icon: '/images/apple-intelligence-sm.png',
    /** Why the model can't run (HEX `apple_intelligence::Availability::description`). */
    unavailable: {
      'device-not-eligible': 'This Mac doesn’t support Apple Intelligence.',
      'model-not-ready': 'The Apple Intelligence model is still downloading. Try again soon.',
      'unsupported-system': 'Requires macOS 26 or later.',
      unknown: 'Apple Intelligence is unavailable right now.',
    },
  },
  appleNotes: {
    title: 'Notes',
    description: `Save each meeting’s summary and transcript as a note in the “${NOTES_FOLDER}” folder of Apple Notes. Saving again updates the note.`,
    deniedHint: 'Kasset is off in System Settings › Privacy & Security › Automation › Notes.',
    icon: '/images/macos-notes-sm.png',
    folder: NOTES_FOLDER,
    /** Line at the end of each note that ties it to its meeting. */
    tagPrefix: 'Kasset meeting',
  },
  spotlight: {
    title: 'Spotlight',
    description: 'Find meetings from Spotlight (⌘Space) by title, attendees, summary, notes, or to-dos. Transcripts stay in Kasset.',
    icon: '/images/macos-spotlight-sm.png',
  },
  hex: {
    title: 'Hex',
    description: "Use Hex's transcription models, and bring every Hex meeting into Kasset.",
    icon: '/images/hex-app-sm.png',
    /** Catch-up on focus at most this often (a full read of Hex's meeting list). */
    focusSyncIntervalMs: 60_000,
  },
  reminders: {
    title: 'Reminders',
    description: 'Send meeting action items to Reminders. Completing one there completes it in Kasset.',
    deniedHint: 'Kasset is off in System Settings › Privacy & Security › Reminders.',
    icon: '/images/macos-reminders-sm.png',
    /** List created on first enable */
    defaultListTitle: 'Kasset',
    /** Reminders fires several change notifications per edit; pull once they settle. */
    pullDebounceMs: 500,
  },
  /** Kasset's tools in coding agents, through Kasset's MCP server (`Kasset mcp`). One card: server, agents, manual setup. */
  codingAgents: {
    section: 'Coding agents',
    server: {
      title: 'Kasset MCP server',
      description: 'Agents get the same tools as Kasset’s chat, and open Kasset in the background when it isn’t running.',
      ready: 'Ready',
      starting: 'Starting',
      connected: (count: number) => `${count} ${count === 1 ? 'agent' : 'agents'} connected`,
    },
    /** Agent row description once Kasset is added. */
    added: 'Added. Start a new session to use Kasset’s tools.',
    outdated: {
      description: 'Added for a copy of Kasset that has moved. Update to fix.',
      action: 'Update',
    },
    notInstalled: 'Not installed on this Mac.',
    manual: {
      title: 'Other agents',
      description: 'Add a local (stdio) MCP server named “kasset” that runs:',
      copy: 'Copy command',
      copied: 'Command copied',
    },
    agents: {
      'claude-code': { title: 'Claude Code', description: 'Added with Claude Code’s own command, for every project.', icon: '/images/model-provider/anthropic.svg' },
      codex: { title: 'Codex', description: 'Added with Codex’s own command.', icon: '/images/model-provider/openai.svg' },
      opencode: { title: 'OpenCode', description: 'Adds one entry to OpenCode’s global config; nothing else changes.', icon: '/images/opencode-app-sm.png' },
    },
  },
  /** `kasset://` links (src-tauri/src/url_actions.rs) for Shortcuts, Raycast, Alfred and notes. */
  urlActions: {
    section: 'URL actions',
    copy: 'Copy link',
    copied: 'Link copied',
    meetingNotFound: 'That meeting isn’t in Kasset.',
    actions: [
      { url: 'kasset://record', description: 'Start recording. The menu bar icon turns red.' },
      { url: 'kasset://stop', description: 'Stop recording and transcribe.' },
      { url: 'kasset://ask?q=', description: 'Ask in a new chat. Put the question after q=.' },
      { url: 'kasset://meeting/<id>', description: 'Open a meeting by its ID.' },
      { url: 'kasset://show', description: 'Bring up Kasset.' },
      { url: 'kasset://settings', description: 'Open Settings.' },
    ],
  },
} as const;
