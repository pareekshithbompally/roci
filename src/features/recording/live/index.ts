/** The in-call transcript: the recording's own audio transcribed as the meeting goes — the draft the screen shows. */

export { liveTranscript, liveTranscriptResult } from './liveTranscript';
export type { LiveEntry } from './liveTranscript';
export { draftEntriesOf, meetingLiveActions, runningTranscript, useMeetingLiveStore } from './meetingLiveStore';
export { useDraftSegments } from './useDraftSegments';
export { useMeetingLive } from './useMeetingLive';
