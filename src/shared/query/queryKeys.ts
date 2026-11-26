import type { UsageQuery } from '@extensions/usage';

/** Integrations whose macOS access is checked (Settings › Integrations), again on returning to Roci. */
export type AccessId = 'calendar' | 'reminders' | 'apple-notes' | 'notifications';

export const queryKeys = {
  notes: (meetingId: string) => ['notes', meetingId] as const,
  /** Generated images (Gallery): its pages and its count. */
  gallery: () => ['gallery'] as const,
  galleryPages: () => ['gallery', 'pages'] as const,
  galleryCount: () => ['gallery', 'count'] as const,
  /** Dictations made in the app (Dictations). */
  dictations: () => ['dictations'] as const,
  /** The Knowledge library: every file kept there, newest first */
  knowledgeLibrary: () => ['knowledge-library'] as const,
  /** Settings › Personalization › Memory, and what chat reads of it. */
  memories: () => ['memories'] as const,
  /** The knowledge graph drawn around `focus` (null: the whole graph) and one entity's detail: under `memories`, so a memory
   *  edit reads them again; a meeting write does too (meetingChanges). */
  knowledge: () => ['memories', 'knowledge'] as const,
  knowledgeGraph: (focus: string | null) => ['memories', 'knowledge', 'graph', focus] as const,
  knowledgeEntity: (id: string) => ['memories', 'knowledge', 'entity', id] as const,
  /** Settings: the storage folder and app version, read once. */
  systemInfo: () => ['system-info'] as const,
  /** Settings › Storage: counts and sizes, measured from disk. */
  storageUsage: () => ['storage-usage'] as const,
  /** Settings › Storage › Search Index: indexed against total meetings and chats. */
  indexStats: () => ['index-stats'] as const,
  meetings: () => ['meetings'] as const,
  /** Every list of meetings and chats (pages, finds, by id, counts); under `meetings` so every meeting write refreshes them,
   *  and chat writes refresh them too */
  items: () => ['meetings', 'items'] as const,
  /** The sidebar, a page at a time */
  sidebar: () => ['meetings', 'items', 'sidebar'] as const,
  /** Meetings matching a filter (recents, a picker's search, busy ones, a calendar event's), first `limit` */
  meetingsFound: (filter: object, limit: number) => ['meetings', 'items', 'found', filter, limit] as const,
  /** One meeting's list row (name, time, status) by id */
  meetingBrief: (id: string) => ['meetings', 'items', 'brief', id] as const,
  /** How many meetings and chats there are */
  itemCounts: () => ['meetings', 'items', 'counts'] as const,
  /** Calendar events (EventKit) in one range on screen, by ISO start/end; all of them reread on `calendar://changed` */
  calendarEvents: (start: string, end: string) => ['calendar-events', start, end] as const,
  calendarEventsAll: () => ['calendar-events'] as const,
  /** One meeting's stats (length, words, models); under `meetings` so every meeting write refreshes it */
  meetingStats: (meetingId: string) => ['meetings', 'stats', meetingId] as const,
  /** One meeting as the meeting view shows it; under `meetings` so every meeting write refreshes it */
  meetingDetail: (meetingId: string) => ['meetings', 'detail', meetingId] as const,
  /** Which of these meetings still exist (a chat's meeting chips); under `meetings` so every meeting write refreshes it */
  meetingsExisting: (ids: string[]) => ['meetings', 'existing', ...ids] as const,
  recordingAudio: (fileName: string) => ['recording-audio', fileName] as const,
  /** A Mac app's icon from macOS, by bundle id (Finder, Calendar, …) */
  appIcon: (bundleId: string) => ['app-icon', bundleId] as const,
  /** A logo image's colour, for a tinted badge (useLogoTint) */
  logoTint: (src: string) => ['logo-tint', src] as const,
  /** macOS permissions a recording needs (checklist rows) */
  permissions: () => ['permissions'] as const,
  /** Running Hex app: whether it answers and its models (transcription engine) */
  hexStatus: () => ['hex-status'] as const,
  /** Roci's curated on-device models (src-tauri/src/models): speech and voice, which are downloaded */
  localModels: () => ['local-models'] as const,
  /** Whether the Mac's on-device server runs with settings other than the current ones (a restart applies them) */
  onDeviceRestart: () => ['on-device-restart'] as const,
  /** The memory llama.cpp projects for a downloaded chat model at a context size and KV cache type (never changes) */
  modelMemory: (id: string, contextTokens: number, kvType: string) => ['model-memory', id, contextTokens, kvType] as const,
  /** Bytes free for model downloads */
  localModelFreeSpace: () => ['local-model-free-space'] as const,
  /** Read aloud: the voices an engine can speak in (macOS system voices, a voice model's) */
  readAloudVoices: (engine: string) => ['read-aloud-voices', engine] as const,
  /** Apple Speech on this Mac: available, Speech Recognition allowed, language model downloaded */
  appleSpeechStatus: () => ['apple-speech-status'] as const,
  /** Apple Intelligence language model availability (Integrations row) */
  appleIntelligenceStatus: () => ['apple-intelligence-status'] as const,
  /** Local OpenAI-compatible servers on this Mac (keyed by the saved local providers it also probes) */
  localServers: (savedTargets: readonly string[]) => ['local-servers', savedTargets] as const,
  /** Every local-server probe (re-probed after a llama-server reply to learn its loaded model's tool support) */
  localServersAll: () => ['local-servers'] as const,
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
  /** Usage summed for one query: window, filters and buckets (Settings → Usage and its detail pages) */
  usage: (query: UsageQuery) => ['usage', 'summary', query] as const,
  /** Every usage total (a logged call changes them all) */
  usageSummaries: () => ['usage', 'summary'] as const,
  /** One session's AI calls (a meeting's or a dictation's); a call logged for it updates it */
  sessionUsage: (sessionId: string) => ['usage', 'session', sessionId] as const,
  /** The URL the webview loads for a file in app data (chat images) */
  appFileUrl: (appPath: string) => ['app-file-url', appPath] as const,
  /** A kept text file's words (a Knowledge document's page) */
  appFileText: (appPath: string) => ['app-file-text', appPath] as const,
  /** Every kept file's URL, read again after Keep or Delete All removes files. */
  appFileUrls: () => ['app-file-url'] as const,
  /** Every usage query: totals and sessions (a price set later reprices them all) */
  usageAll: () => ['usage'] as const,

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
