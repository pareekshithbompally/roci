/** The in-call transcript: the recording's own chunks transcribed as the meeting goes, then kept as its transcript. */

export { chunkEntries, liveTranscript, liveTranscriptResult, shedBacklog, spliceSeam, suppressEcho, withoutEcho } from './liveTranscript';
export type { LiveEntry } from './liveTranscript';
export { meetingLiveActions, useDraftEntries, useMeetingLiveStore } from './meetingLiveStore';
export { useDraftSegments } from './useDraftSegments';
export { useMeetingLive } from './useMeetingLive';
