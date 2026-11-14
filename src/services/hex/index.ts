/**
 * Hex integration — meetings (read-only CLI JSON + finished events) and sync.
 * Hex transcription models live with the other engines in services/ai/transcription.
 */
export { hexMeetings } from './hex.meetings';
export { hexSync, kassetMeetingId, toTranscriptionResult } from './hex.sync';
export type { HexMeeting, HexMeetingDetail, HexEntry, HexEventsState } from './hex.meetings';
export type { SummaryContext } from './hex.sync';
