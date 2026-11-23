/** Audio settings for recording, processing and playback. */

export const AUDIO_CONFIG = {
  // Recording settings
  recording: {
    defaultSampleRate: 16000,

    // File size limits
    maxSizeMB: 500, // Browser safe limit
    maxSizeBytes: 500 * 1024 * 1024,

    // The WAV header is 44 bytes; any file this size or smaller holds no audio.
    wavHeaderSizeBytes: 44,
    // Minimum meaningful audio: header + at least 1 second of 16kHz 16-bit mono PCM = 32044 bytes
    minAudioSizeBytes: 44 + (16000 * 2),
  },

  // Capture source options
  captureSources: {
    /** `requires`: the macOS access each source needs, said under the picker. */
    systemAndMicrophone: {
      label: 'System + Microphone',
      requires: 'Screen Recording and Microphone access required.',
    },
    system: {
      label: 'System Audio',
      requires: 'Screen Recording permission required.',
    },
    microphone: {
      label: 'Microphone',
      requires: 'Microphone access required.',
    },
  },
} as const;

/** Limits for importing audio and subtitle/transcript files. */
export const IMPORT_CONFIG = {
  audio: {
    extensions: ['wav', 'mp3', 'm4a', 'webm', 'ogg', 'flac'],
    mimeTypes: {
      wav: 'audio/wav',
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      webm: 'audio/webm',
      ogg: 'audio/ogg',
      flac: 'audio/flac',
    } as Record<string, string>,
    maxSizeMB: AUDIO_CONFIG.recording.maxSizeMB,
    maxSizeBytes: AUDIO_CONFIG.recording.maxSizeBytes,
    dialogTitle: 'Select audio files',
  },
  transcript: {
    extensions: ['srt', 'vtt'],
    mimeTypes: {
      srt: 'text/srt',
      vtt: 'text/vtt',
    } as Record<string, string>,
    dialogTitle: 'Select transcript files',
  },
  /** Imported audio: one at a time, or up to `maxConcurrentLimit` at once (`defaultMaxConcurrent` when parallel is first chosen). */
  jobProcessing: {
    defaultMaxConcurrent: 2,
    maxConcurrentLimit: 5,
  },
} as const;

/** Audio capture source options. */
export type AudioCaptureSource =
  | 'microphone'
  | 'system'
  | 'systemAndMicrophone'
  | 'file-upload';

/** Recording pipeline events; names mirror the Rust constants (`audio/level.rs`, `audio/commands.rs`, `window.rs`). */
export const RECORDING_EVENTS = {
  /** Level-meter frame; the frontend uses it as the capture heartbeat. */
  level: 'coreaudio-level',
  /** Cmd+Q while a recording is capturing. */
  quitRequested: 'quit-requested',
  /** Window close while a recording is capturing. */
  closeRequested: 'close-requested',
  /** The recorder changed by itself (an iPhone call paused or resumed it); mirrors `audio/commands.rs`. */
  recorderChanged: 'recorder://changed',
  /** A meeting was saved or deleted (any write: status, transcript, summary, notes, to-dos); mirrors the store plugin's
   *  `MEETING_CHANGED_EVENT`. */
  meetingChanged: 'meeting://changed',
} as const;
