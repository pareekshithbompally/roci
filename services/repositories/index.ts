/**
 * Repositories — barrel exports
 */

// Base
export { BaseRepository } from './base.repository';
export { IndexedRepository } from './indexed.repository';
export { DocumentRepository } from './document.repository';

// Concrete repositories
export { meetingIndexRepository } from './meeting-index.repository';
export { transcriptRepository } from './transcript.repository';
export { summaryRepository } from './summary.repository';
export { notesRepository } from './notes.repository';
export { todosRepository } from './todos.repository';
export { recordingMetaRepository } from './recording-meta.repository';
export { chatIndexRepository } from './chat-index.repository';
export { chatSessionRepository } from './chat-session.repository';
export type { StoredChatSession } from './chat-session.repository';
