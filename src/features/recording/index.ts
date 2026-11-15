/** Recording feature: provider, controls, and audio source selection. */

// Context
export { RecordingProvider, useRecordingContext, useRecordingSessions } from './context';

// Hooks
export { useRecording, useRecordingTimer, useAudioSource } from './hooks';
export type { AudioSourceOption } from './hooks';

// Services
export { recordingService } from './services';
export type { StartRecordingOptions, StartRecordingResult, StopRecordingResult } from './services';

// Components
export { PermissionChecklist, RecordingExitPrompt } from './components';

// Types
export type {
  RecordingStatus,
  RecordingState,
  RecordingMetadata,
  RecordingActions,
  RecordingContextValue,
  RecordingSession,
  RecordingSessionStatus,
  RecordingSessionActions,
  RecordingSessionsContextValue,
} from './types';
