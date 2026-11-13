import { invoke } from '@tauri-apps/api/core'
import { readFile } from '@tauri-apps/plugin-fs'
import type { AudioCaptureSource } from '@config/audio.config'
import type { PermissionKind } from '@services/permissions.service'

export interface AudioCaptureOptions {
  source: AudioCaptureSource
  fileName?: string
  recordingsDir?: string
}

export interface AudioCaptureResult {
  blob: Blob
  path: string
}

/** Why a capture command failed (Rust `CaptureError`). */
export type CaptureError =
  | { code: 'permission'; kind: PermissionKind }
  | { code: 'capture'; message: string }

function isCaptureError(error: unknown): error is CaptureError {
  return typeof error === 'object' && error !== null && 'code' in error
}

/** A start refused for a missing permission: open the checklist, no error toast. */
export function isPermissionRefusal(error: unknown): boolean {
  return isCaptureError(error) && error.code === 'permission'
}

/** The text to show for a capture command that failed for any other reason. */
export function captureErrorMessage(error: unknown): string {
  if (isCaptureError(error) && error.code === 'capture') return error.message
  return error instanceof Error ? error.message : 'Failed to start recording'
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

  async pauseCapture(): Promise<void> {
    await invoke('pause_audio_capture')
  }

  async resumeCapture(): Promise<void> {
    await invoke('resume_audio_capture')
  }
}

export const coreAudioService = new CoreAudioService()
