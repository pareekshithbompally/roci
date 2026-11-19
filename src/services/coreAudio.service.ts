import { invoke } from '@tauri-apps/api/core'
import type { AudioCaptureSource } from '@config/audio.config'
import type { PermissionKind } from '@services/permissions.service'
import { isCodedError } from '@shared/utils/errors'

/** What Record needs to create the meeting before capture starts (Rust `AudioCaptureOptions`). */
export interface AudioCaptureOptions {
  source: AudioCaptureSource
  title: string
  calendarEventId?: string
  calendarMeta?: Record<string, unknown>
  /** The chosen speech model streams: the in-call audio comes as frames, not chunks. */
  liveStreaming?: boolean
}

/** Why a capture command failed (Rust `CaptureError`). */
export type CaptureError =
  | { code: 'permission'; kind: PermissionKind }
  | { code: 'capture'; message: string }

/** What the recorder is doing (Rust `RecorderState`): the one source of truth for the live recording. */
export type RecorderState =
  | { state: 'idle' }
  | { state: 'recording'; meetingId: string; recordedMs: number; paused: boolean; liveStreaming: boolean }

const isCaptureError =(error: unknown): error is CaptureError => isCodedError<CaptureError>(error)

/** A start refused for a missing permission: open the checklist, no error toast. */
export function isPermissionRefusal(error: unknown): boolean {
  return isCaptureError(error) && error.code === 'permission'
}

/** The text to show for a capture command that failed for any other reason. */
export function captureErrorMessage(error: unknown, fallback: string): string {
  if (isCaptureError(error) && error.code === 'capture') return error.message
  return error instanceof Error ? error.message : fallback
}

class CoreAudioService {
  /** Creates the meeting and starts recording it; resolves with its id. */
  async startCapture(options: AudioCaptureOptions): Promise<string> {
    return invoke<string>('start_audio_capture', {
      options: {
        source: options.source,
        title: options.title,
        calendarEventId: options.calendarEventId ?? null,
        calendarMeta: options.calendarMeta ? JSON.stringify(options.calendarMeta) : null,
        liveStreaming: options.liveStreaming ?? false,
      },
    })
  }

  /** Stops recording; the meeting becomes `captured` (or `failed`). Resolves with its id, `null` when none ran. */
  async stopCapture(): Promise<string | null> {
    return invoke<string | null>('stop_audio_capture')
  }

  async pauseCapture(): Promise<void> {
    await invoke('pause_audio_capture')
  }

  async resumeCapture(): Promise<void> {
    await invoke('resume_audio_capture')
  }

  /** Waits out a start or stop in progress, so it never reports a half-made recording. */
  async recorderState(): Promise<RecorderState> {
    return invoke<RecorderState>('recorder_state')
  }
}

export const coreAudioService = new CoreAudioService()
