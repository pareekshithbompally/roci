/**
 * Prompts Index
 * Re-exports all prompt builders
 */

export { buildChatSystemPrompt, buildRAGContextPrompt } from './chat.prompt';
export type { ChatPromptOptions } from './chat.prompt';

export { buildTranscriptionPrompt, VERBATIM_TRANSCRIBE_PROMPT } from './transcription.prompt';
export type { TranscriptionPromptOptions } from './transcription.prompt';

export { buildVTTDocumentPrompt, buildGenericDocumentPrompt } from './document.prompt';

export { buildEntityExtractionPrompt } from './entity-extraction.prompt';

export { formatTemporalContext } from '@core/ai/temporal';
