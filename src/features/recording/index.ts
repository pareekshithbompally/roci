/**
 * Recording Feature Module
 *
 * Handles all recording-related functionality:
 * - Recording controls (start, stop, pause, resume)
 * - Audio source selection
 *
 * Usage:
 * ```tsx
 * import { RecordingProvider, useRecording, RecordButton } from '@/features/recording';
 *
 * // Wrap your app with the provider
 * <RecordingProvider>
 *   <App />
 * </RecordingProvider>
 *
 * // Use the hook in components
 * const { startRecording, stopRecording, status } = useRecording();
 * ```
 */

// Context
export { RecordingProvider, useRecordingContext, useRecordingSessions } from './context';

// Hooks
export { useRecording, useRecordingTimer, useAudioSource } from './hooks';
export type { AudioSourceOption } from './hooks';

// Services
export { recordingService } from './services';
export type { StartRecordingOptions, StartRecordingResult, StopRecordingResult } from './services';

// Components
export { RecordButton } from './components';

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
