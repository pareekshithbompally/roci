import { invoke } from '@tauri-apps/api/core'
import { readFile } from '@tauri-apps/plugin-fs'
import type { AudioCaptureSource } from '@config/audio.config'

export interface AudioCaptureOptions {
  source: AudioCaptureSource
  fileName?: string
  recordingsDir?: string
}

export interface AudioCaptureResult {
  blob: Blob
  path: string
  aiBlob: Blob
  aiPath: string
}

interface RecordingPaths {
  playbackPath: string
  aiPath: string
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
    const paths = await invoke<RecordingPaths>('stop_audio_capture')

    if (!paths.playbackPath || paths.playbackPath.includes('No active')) {
      return null
    }

    const [hqData, aiData] = await Promise.all([
      readFile(paths.playbackPath),
      readFile(paths.aiPath),
    ])

    return {
      blob: new Blob([hqData], { type: 'audio/wav' }),
      path: paths.playbackPath,
      aiBlob: new Blob([aiData], { type: 'audio/wav' }),
      aiPath: paths.aiPath,
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
