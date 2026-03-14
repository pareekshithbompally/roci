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
    const outputPath = await invoke<string>('stop_audio_capture')
    if (!outputPath || outputPath.includes('No active')) {
      return null
    }

    const data = await readFile(outputPath)
    return {
      blob: new Blob([data], { type: 'audio/wav' }),
      path: outputPath,
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
