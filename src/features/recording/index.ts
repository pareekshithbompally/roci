/** Recording feature: the live recording, the meeting pipeline, permissions, and the exit prompt. */

export {
  recording,
  useRecordingStore,
  useRecordingMeetingId,
  useRecordingPaused,
  useRecordingBusy,
} from './stores/recordingStore';
export { meetingPipeline } from './pipeline/meetingPipeline';
export { useRecordingRuntime, useStartRecording, usePermissions } from './hooks';
export { PermissionChecklist, RecordingExitPrompt, RecordPill, RecordingMeetingView } from './components';
export { meetingLiveActions, useMeetingLiveStore } from './live';
export { useInterimAiNotes } from './notes';
