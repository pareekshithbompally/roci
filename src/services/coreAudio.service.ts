import { invoke } from '@tauri-apps/api/core'
import { readFile } from '@tauri-apps/plugin-fs'
import type { AudioCaptureSource } from '@config/audio.config'
import type { PermissionKind } from '@services/permissions.service'
import { isCodedError } from '@shared/utils/errors'

export interface AudioCaptureOptions {
  source: AudioCaptureSource
  fileName?: string
  recordingsDir?: string
}

export interface AudioCaptureResult {
  blob: Blob
  path: string
}

/** A recording a quit or crash left unfinished, mixed down at launch (Rust `RecoveredRecording`). */
export interface RecoveredRecording {
  /** The mixed file's name inside the recordings directory. */
  fileName: string
  source: AudioCaptureSource
  durationSecs: number
  size: number
  recordedAtMs: number
}

/** Why a capture command failed (Rust `CaptureError`). */
export type CaptureError =
  | { code: 'permission'; kind: PermissionKind }
  | { code: 'capture'; message: string }

const isCaptureError = (error: unknown): error is CaptureError => isCodedError<CaptureError>(error)

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
  async startCapture(options: AudioCaptureOptions): Promise<void> {
    await invoke('start_audio_capture', {
      options: {
        source: options.source,
        fileName: options.fileName,
        recordingsDir: options.recordingsDir,
      },
    })
  }

  /** Stops the recording; `null` when none was running. */
  async stopCapture(): Promise<AudioCaptureResult | null> {
    const path = await invoke<string | null>('stop_audio_capture')
    if (!path) return null

    const data = await readFile(path)
    return { blob: new Blob([data], { type: 'audio/wav' }), path }
  }

  /** Mixes down recordings a quit or crash left unfinished; none while a recording runs. */
  async recoverRecordings(recordingsDir: string): Promise<RecoveredRecording[]> {
    return invoke<RecoveredRecording[]>('recover_recordings', { recordingsDir })
  }

  async pauseCapture(): Promise<void> {
    await invoke('pause_audio_capture')
  }

  async resumeCapture(): Promise<void> {
    await invoke('resume_audio_capture')
  }
}

export const coreAudioService = new CoreAudioService()
