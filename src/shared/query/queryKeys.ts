/** Integrations whose macOS access is checked (Settings › Integrations), again on returning to Roci. */
export type AccessId = 'calendar' | 'reminders' | 'apple-notes' | 'notifications';

export const queryKeys = {
  notes: (meetingId: string) => ['notes', meetingId] as const,
  todos: (meetingId: string) => ['todos', meetingId] as const,
  meetings: () => ['meetings'] as const,
  /** One meeting's stats (length, words, models); under `meetings` so every meeting write refreshes it */
  meetingStats: (meetingId: string) => ['meetings', 'stats', meetingId] as const,
  globalTodos: () => ['todos', 'global'] as const,
  recordingAudio: (fileName: string) => ['recording-audio', fileName] as const,
  /** A Mac app's icon from macOS, by bundle id (Finder, Calendar, …) */
  appIcon: (bundleId: string) => ['app-icon', bundleId] as const,
  /** macOS permissions a recording needs (checklist rows) */
  permissions: () => ['permissions'] as const,
  /** Running Hex app: whether it answers and its models (transcription engine) */
  hexStatus: () => ['hex-status'] as const,
  /** Roci's curated on-device models (src-tauri/src/models): speech and voice, which are downloaded */
  localModels: () => ['local-models'] as const,
  /** Read aloud: the voices an engine can speak in (macOS system voices, a voice model's) */
  readAloudVoices: (engine: string) => ['read-aloud-voices', engine] as const,
  /** Apple Speech on this Mac: available, Speech Recognition allowed, language model downloaded */
  appleSpeechStatus: () => ['apple-speech-status'] as const,
  /** Apple Intelligence language model availability (Integrations row) */
  appleIntelligenceStatus: () => ['apple-intelligence-status'] as const,
  /** Local OpenAI-compatible servers on this Mac (keyed by the saved local providers it also probes) */
  localServers: (savedTargets: readonly string[]) => ['local-servers', savedTargets] as const,
  /** A provider's model list, fetched with this key and URL: its connection test (memory-only cache) */
  providerModels: (provider: string, baseUrl: string, apiKey: string) => ['provider-models', provider, baseUrl, apiKey] as const,
  /** MCP: `mcp_config.json` (servers + settings), owned by Rust */
  mcpConfig: () => ['mcp', 'config'] as const,
  /** MCP: names of servers with a live connection */
  mcpConnected: () => ['mcp', 'connected'] as const,
  /** MCP: tools offered by connected servers */
  mcpTools: () => ['mcp', 'tools'] as const,
  /** MCP: connected servers' self-description (title, icon) */
  mcpServerInfo: () => ['mcp', 'server-info'] as const,
  /** Roci's own MCP server: listening, agents connected, the command agents launch */
  mcpHost: () => ['mcp-host', 'status'] as const,
  /** Coding agents: installed, and whether their config registers Roci */
  codingAgents: () => ['mcp-host', 'coding-agents'] as const,
  /** macOS access for one integration (EventKit calendars / reminders, Automation → Notes) */
  integrationAccess: (id: AccessId) => ['integration-access', id] as const,
  /** macOS Reminders lists (Integrations › Reminders list picker) */
  remindersLists: () => ['reminders', 'lists'] as const,
  /** models.dev catalog: model capabilities, context limits, pricing */
  modelCatalog: () => ['model-catalog'] as const,
  /** A remote image (model avatar, MCP server icon) as a cached `data:` source, by URL */
  cachedImage: (url: string) => ['cached-image', url] as const,
  /** Token usage summary for a time range (Settings → Usage) */
  usage: (range: string) => ['usage', range] as const,

  // ── Unified store (single `roci.db`) ──
  /** Store health / meta */
  storeMeta: () => ['store', 'meta'] as const,
  /** Store statistics */
  storeStats: () => ['store', 'stats'] as const,
  /** Chat session index (sidebar listing) */
  chats: () => ['chats'] as const,
  /** Single chat session with messages */
  chat: (id: string) => ['chats', id] as const,
  /** Notes via unified store */
  storeNotes: (meetingId: string) => ['store', 'notes', meetingId] as const,
  /** Todos via unified store (per-meeting) */
  /** Prefix of every stored to-do list (per meeting + global) */
  storeTodosAll: () => ['store', 'todos'] as const,
  storeTodos: (meetingId: string) => ['store', 'todos', meetingId] as const,
  /** Global todos via unified store */
  storeGlobalTodos: () => ['store', 'todos', 'global'] as const,
  /** Settings via unified store */
  storeSettings: () => ['store', 'settings'] as const,
  /** Providers via unified store */
  storeProviders: () => ['store', 'providers'] as const,
  /** Categories via unified store */
  storeCategories: () => ['store', 'categories'] as const,
};
