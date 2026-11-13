export const queryKeys = {
  notes: (meetingId: string) => ['notes', meetingId] as const,
  todos: (meetingId: string) => ['todos', meetingId] as const,
  meetings: () => ['meetings'] as const,
  globalTodos: () => ['todos', 'global'] as const,
  recordingAudio: (fileName: string) => ['recording-audio', fileName] as const,
  /** macOS permissions a recording needs (checklist rows) */
  permissions: () => ['permissions'] as const,
  /** HuggingFace GGUF model search (debounced query text) */
  hfModelSearch: (query: string) => ['hf', 'search', query] as const,
  /** GGUF file list for a HuggingFace repo (hasToken splits gated/public cache) */
  hfRepoFiles: (repoId: string, hasToken: boolean) => ['hf', 'repo', repoId, hasToken] as const,

  // ── Unified store (single `kasset.db`) ──
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
