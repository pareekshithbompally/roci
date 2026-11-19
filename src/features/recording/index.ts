/** Recording feature: the live recording, the meeting pipeline, permissions, and the exit prompt. */

export {
  recording,
  useRecordingStore,
  useRecordingMeetingId,
  useRecordingPaused,
  useRecordingBusy,
} from './stores/recordingStore';
export { meetingPipeline } from './pipeline/meetingPipeline';
export { useRecordingRuntime, useStartRecording, useToggleRecording, usePermissions } from './hooks';
export { MeetingWorkspace, PermissionChecklist, RecordingExitPrompt, RecordPill, RecordingMeetingView } from './components';
export type { WorkspaceTranscript } from './components';
export { useAiBullets, useLiveNotes } from './notes';
export { useDraftSegments, useMeetingLiveStore } from './live';
