export const queryKeys = {
  notes: (meetingId: string) => ['notes', meetingId] as const,
  todos: (meetingId: string) => ['todos', meetingId] as const,
  meetings: () => ['meetings'] as const,
  globalTodos: () => ['todos', 'general'] as const,
  recordingAudio: (fileName: string) => ['recording-audio', fileName] as const,
  /** HuggingFace GGUF model search (debounced query text) */
  hfModelSearch: (query: string) => ['hf', 'search', query] as const,
  /** GGUF file list for a HuggingFace repo (hasToken splits gated/public cache) */
  hfRepoFiles: (repoId: string, hasToken: boolean) => ['hf', 'repo', repoId, hasToken] as const,
};
