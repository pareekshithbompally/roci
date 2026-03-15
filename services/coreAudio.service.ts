import { invoke } from '@tauri-apps/api/core'
import { readFile } from '@tauri-apps/plugin-fs'
import type { AudioCaptureSource } from '../src/config/audio.config'

export interface AudioCaptureOptions {
  source: AudioCaptureSource
  fileName?: string
  recordingsDir?: string
}

export interface AudioCaptureResult {
  blob: Blob
  path: string
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

  async stopCapture(): Promise<AudioCaptureResult | null> {
    const STOP_TIMEOUT_MS = 3000

    try {
      // Race the Rust invoke against a timeout
      const outputPath = await Promise.race([
        invoke<string>('stop_audio_capture'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('stop_timeout')), STOP_TIMEOUT_MS)
        ),
      ])

      if (!outputPath || outputPath.includes('No active')) {
        return null
      }

      const data = await readFile(outputPath)
      return {
        blob: new Blob([data], { type: 'audio/wav' }),
        path: outputPath,
      }
    } catch (error: any) {
      if (error.message === 'stop_timeout') {
        console.warn('[CoreAudioService] stop_audio_capture timed out after', STOP_TIMEOUT_MS, 'ms')
        // Fire-and-forget another stop attempt (Rust may eventually respond)
        invoke('stop_audio_capture').catch(() => {})
        // Return null — caller should attempt WAV recovery from known path
        return null
      }
      throw error
    }
  }

  async pauseCapture(): Promise<void> {
    await invoke('pause_audio_capture')
  }

  async resumeCapture(): Promise<void> {
    await invoke('resume_audio_capture')
  }
}

export const coreAudioService = new CoreAudioService()
