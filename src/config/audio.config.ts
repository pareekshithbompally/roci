/** Audio settings for recording, processing and playback. */

export const AUDIO_CONFIG = {
  // Recording settings
  recording: {
    // Sample rates (Hz)
    sampleRate: {
      voice: 16000,      // Optimized for speech (Gemini default)
      standard: 24000,   // Balanced quality
      high: 44100,       // CD quality
      professional: 48000, // Professional audio
    },
    defaultSampleRate: 16000,

    // Bit rates (kbps)
    bitrate: {
      low: 64,
      medium: 96,
      high: 128,
      veryHigh: 192,
    },
    defaultBitrate: 96,

    // Codec preferences (in order of preference)
    codecs: [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/wav',
    ],

    // Audio constraints
    constraints: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 2, // Stereo
    },

    // File size limits
    maxSizeMB: 500, // Browser safe limit
    maxSizeBytes: 500 * 1024 * 1024,
    maxDurationSeconds: 7200, // 2 hours

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

  // Audio processing
  processing: {
    // Normalization
    normalize: {
      enabled: false,
      targetLevel: -14, // dB LUFS (Loudness Units Full Scale)
    },

    // Compression
    compression: {
      enabled: false,
      threshold: -24,  // dB
      ratio: 4,        // 4:1
      attack: 0.003,   // seconds
      release: 0.25,   // seconds
    },

    // High-pass filter (removes low-frequency noise)
    highPassFilter: {
      enabled: true,
      frequency: 80, // Hz
      q: 1.0,
    },
  },

  // Device management
  devices: {
    // Auto-refresh device list interval
    refreshInterval: 5000, // 5 seconds

    // Device types
    types: {
      audioinput: 'Microphone',
      audiooutput: 'Speaker',
      videoinput: 'Camera',
    },

    // Default device labels
    defaultLabels: {
      audioinput: 'Default Microphone',
      audiooutput: 'Default Speaker',
    },
  },

  // Error messages
  errors: {
    permissionDenied: 'Microphone access denied. Please grant permission in your browser settings.',
    deviceNotFound: 'Audio device not found. Please check your microphone connection.',
    deviceBusy: 'Microphone is being used by another application.',
    deviceDisconnected: 'Microphone was disconnected during recording.',
    unsupportedFormat: 'Your browser doesn\'t support audio recording.',
    recordingFailed: 'Failed to start recording. Please try again.',
    processingFailed: 'Failed to process audio. The file may be corrupted.',
    fileTooLarge: 'Audio file is too large. Maximum size is 500MB.',
    durationTooLong: 'Recording duration exceeds maximum limit of 2 hours.',
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

/** Audio device information. */
export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
  groupId?: string;
  isDefault?: boolean;
}

/** Audio capture source options. */
export type AudioCaptureSource =
  | 'microphone'
  | 'system'
  | 'systemAndMicrophone'
  | 'file-upload';

export function isAudioFileSizeValid(sizeBytes: number): boolean {
  return sizeBytes <= AUDIO_CONFIG.recording.maxSizeBytes;
}

export function isRecordingDurationValid(durationSeconds: number): boolean {
  return durationSeconds <= AUDIO_CONFIG.recording.maxDurationSeconds;
}

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
