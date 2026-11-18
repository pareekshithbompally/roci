/** The in-call transcript: the recording's own chunks transcribed as the meeting goes, then kept as its transcript. */

export { chunkEntries, liveTranscript, liveTranscriptResult, shedBacklog, spliceSeam, suppressEcho, withoutEcho } from './liveTranscript';
export type { LiveEntry, LiveOutcome } from './liveTranscript';
export { meetingLiveActions, useMeetingLiveStore } from './meetingLiveStore';
export { useMeetingLive } from './useMeetingLive';
