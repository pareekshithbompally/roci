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
}

class CoreAudioService {
  async startCapture(options: AudioCaptureOptions): Promise<void> {
    console.log('[DIAG:CoreAudio] startCapture called with:', JSON.stringify(options));
    await invoke('start_audio_capture', {
      options: {
        source: options.source,
        fileName: options.fileName,
        recordingsDir: options.recordingsDir,
      },
    })
    console.log('[DIAG:CoreAudio] start_audio_capture invoke returned OK');
  }

  async stopCapture(): Promise<AudioCaptureResult | null> {
    const STOP_TIMEOUT_MS = 3000
    console.log('[DIAG:CoreAudio] stopCapture called, timeout=%dms', STOP_TIMEOUT_MS);

    try {
      // Race the Rust invoke against a timeout
      const outputPath = await Promise.race([
        invoke<string>('stop_audio_capture'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('stop_timeout')), STOP_TIMEOUT_MS)
        ),
      ])
      console.log('[DIAG:CoreAudio] stop_audio_capture returned:', outputPath);

      if (!outputPath || outputPath.includes('No active')) {
        console.warn('[DIAG:CoreAudio] No active capture path returned');
        return null
      }

      console.log('[DIAG:CoreAudio] Reading file from:', outputPath);
      const data = await readFile(outputPath)
      console.log('[DIAG:CoreAudio] File read, size=%d bytes', data.byteLength);
      if (data.byteLength <= 44) {
        console.error('[DIAG:CoreAudio] *** CRITICAL: File is WAV header only! Zero audio captured! ***');
      }
      return {
        blob: new Blob([data], { type: 'audio/wav' }),
        path: outputPath,
      }
    } catch (error: any) {
      if (error.message === 'stop_timeout') {
        console.warn('[DIAG:CoreAudio] stop_audio_capture TIMED OUT after', STOP_TIMEOUT_MS, 'ms');
        // Fire-and-forget another stop attempt (Rust may eventually respond)
        invoke('stop_audio_capture').catch(() => {})
        // Return null — caller should attempt WAV recovery from known path
        return null
      }
      console.error('[DIAG:CoreAudio] stopCapture error:', error);
      throw error
    }
  }

  async pauseCapture(): Promise<void> {
    console.log('[DIAG:CoreAudio] pauseCapture called');
    await invoke('pause_audio_capture')
    console.log('[DIAG:CoreAudio] pause_audio_capture returned');
  }

  async resumeCapture(): Promise<void> {
    console.log('[DIAG:CoreAudio] resumeCapture called');
    await invoke('resume_audio_capture')
    console.log('[DIAG:CoreAudio] resume_audio_capture returned');
  }
}

export const coreAudioService = new CoreAudioService()
