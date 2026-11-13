/**
 * Recording Feature Types
 * 
 * Type definitions for the recording feature module
 */

import type { AudioCaptureSource } from '@config/audio.config';
import type { CalendarRecordingMeta } from '@services/calendar/recording-bridge';

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopped' | 'review' | 'processing';

// Session-based recording types
export type RecordingSessionStatus = 'recording' | 'paused' | 'review' | 'processing';

/** A finished recording to register and add to history. */
export interface HistoryEntry {
  recordingId: string;
  filename: string;
  duration: number;
  size: number;
  source: AudioCaptureSource;
  /** When the recording started (ms): its history date and default title. */
  recordedAt: number;
  calendarMeta?: CalendarRecordingMeta | null;
}

export interface RecordingSession {
  sessionId: string;
  status: RecordingSessionStatus;
  elapsedTime: number;
  isPaused: boolean;
  audioSource: AudioCaptureSource;
  recordingId: string;
  recordingFilename: string;
  recordedFilePath: string | null;
  recordedBlob: Blob | null;
  audioUrl: string | null;
  error: string | null;
  createdAt: number;
  /** True when audio level events stop arriving (stream may have died) */
  stalled: boolean;
  /** True while stopCapture() is in-flight — shows "Stopping..." in activity tray */
  stopping?: boolean;
  /** Calendar metadata from notification-triggered recording (consumed once at start). */
  calendarMeta?: CalendarRecordingMeta | null;
}

export interface RecordingState {
  status: RecordingStatus;
  elapsedTime: number;
  isPaused: boolean;
  audioSource: AudioCaptureSource;
  recordingId: string | null;
  recordingFilename: string | null;
  recordedFilePath: string | null;
  recordedBlob: Blob | null;
  audioUrl: string | null;
  error: string | null;
}

export interface RecordingMetadata {
  id: string;
  filename: string;
  duration: number;
  size: number;
  inputSource: AudioCaptureSource;
  createdAt: number;
  transcriptionId?: string;
  summaryId?: string;
}

export interface RecordingActions {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  discardRecording: () => Promise<void>;
  processRecording: () => Promise<void>;
  abortProcessing: () => void;
  setAudioSource: (source: AudioCaptureSource) => void;
  resetRecording: () => void;
}

export interface RecordingContextValue extends RecordingState, RecordingActions {
  // Computed values
  isRecording: boolean;
  canRecord: boolean;
}

// Session-based recording context
export interface RecordingSessionActions {
  startRecording: () => Promise<string>; // returns sessionId
  stopRecording: (sessionId: string) => Promise<void>;
  pauseRecording: (sessionId: string) => Promise<void>;
  resumeRecording: (sessionId: string) => Promise<void>;
  discardRecording: (sessionId: string) => Promise<void>;
  processRecording: (sessionId: string) => Promise<void>;
  saveLater: (sessionId: string) => Promise<void>;
  /** Stops capture and saves the recording straight to history. */
  stopAndSaveRecording: (sessionId: string) => Promise<void>;
  abortProcessing: (sessionId: string) => void;
  setAudioSource: (source: AudioCaptureSource) => void;
}

export interface RecordingSessionsContextValue extends RecordingSessionActions {
  sessions: Map<string, RecordingSession>;
  activeCaptureSessionId: string | null;
  canStartNewCapture: boolean;
  audioSource: AudioCaptureSource;
}

// Event types for recording events
export interface RecordingStartedEvent {
  recordingId: string;
  filename: string;
  source: AudioCaptureSource;
  timestamp: number;
}

export interface RecordingStoppedEvent {
  recordingId: string;
  filename: string;
  duration: number;
  filePath: string;
  blob: Blob;
}

export interface RecordingDiscardedEvent {
  recordingId: string;
  filename: string;
}
