export const queryKeys = {
  notes: (meetingId: string) => ['notes', meetingId] as const,
  todos: (meetingId: string) => ['todos', meetingId] as const,
  meetings: () => ['meetings'] as const,
  globalTodos: () => ['todos', 'general'] as const,
  recordingAudio: (fileName: string) => ['recording-audio', fileName] as const,
};
