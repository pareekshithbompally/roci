/**
 * Audio Configuration
 * 
 * Centralized audio settings for recording, processing, and playback.
 * All audio-related parameters should be defined here.
 */

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

    // WAV validation thresholds
    // WAV header is exactly 44 bytes. Any file ≤ this size contains no audio data.
    wavHeaderSizeBytes: 44,
    // Minimum meaningful audio: header + at least 1 second of 16kHz 16-bit mono PCM = 32044 bytes
    minAudioSizeBytes: 44 + (16000 * 2),
  },

  // Capture source options
  captureSources: {
    systemAndMicrophone: {
      label: 'System + Microphone',
      description: 'Capture system audio and mic together',
    },
    system: {
      label: 'System Audio',
      description: 'Capture system audio only',
    },
    microphone: {
      label: 'Microphone',
      description: 'Capture microphone only',
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

  // Quality presets
  presets: {
    voice: {
      name: 'Voice (16kHz)',
      sampleRate: 16000,
      bitrate: 64,
      noiseSuppression: true,
      echoCancellation: true,
      description: 'Optimized for speech transcription',
    },
    podcast: {
      name: 'Podcast (24kHz)',
      sampleRate: 24000,
      bitrate: 96,
      noiseSuppression: true,
      echoCancellation: false,
      description: 'Balanced quality for podcasts',
    },
    music: {
      name: 'Music (44.1kHz)',
      sampleRate: 44100,
      bitrate: 128,
      noiseSuppression: false,
      echoCancellation: false,
      description: 'High quality for music recording',
    },
    professional: {
      name: 'Professional (48kHz)',
      sampleRate: 48000,
      bitrate: 192,
      noiseSuppression: false,
      echoCancellation: false,
      description: 'Professional studio quality',
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

  // Permission checklist: grants are re-read this often while it is open (HEX reads once a second)
  permissions: {
    pollIntervalMs: 1000,
  },
} as const;

/**
 * Import Configuration
 *
 * Constants for importing audio files and subtitle/transcript files.
 */
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
  jobProcessing: {
    defaultMode: 'sequential' as const,
    defaultMaxConcurrent: 2,
    maxConcurrentLimit: 5,
  },
} as const;

/**
 * Audio device information
 */
export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
  groupId?: string;
  isDefault?: boolean;
}

/**
 * Audio quality settings
 */
export interface AudioQualitySettings {
  sampleRate: number;
  bitrate?: number;
  codec?: string;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
}

/**
 * Audio capture source options
 */
export type AudioCaptureSource =
  | 'microphone'
  | 'system'
  | 'systemAndMicrophone'
  | 'file-upload';

/**
 * Get quality preset by name
 */
export function getQualityPreset(name: keyof typeof AUDIO_CONFIG.presets): AudioQualitySettings {
  const preset = AUDIO_CONFIG.presets[name];
  return {
    sampleRate: preset.sampleRate,
    bitrate: preset.bitrate,
    noiseSuppression: preset.noiseSuppression,
    echoCancellation: preset.echoCancellation,
    autoGainControl: true,
  };
}

/**
 * Validate audio file size
 */
export function isAudioFileSizeValid(sizeBytes: number): boolean {
  return sizeBytes <= AUDIO_CONFIG.recording.maxSizeBytes;
}

/**
 * Validate recording duration
 */
export function isRecordingDurationValid(durationSeconds: number): boolean {
  return durationSeconds <= AUDIO_CONFIG.recording.maxDurationSeconds;
}

/**
 * Format audio quality for display
 */
export function formatAudioQuality(settings: AudioQualitySettings): string {
  const rate = settings.sampleRate / 1000;
  const bitrate = settings.bitrate || 'auto';
  return `${rate}kHz • ${bitrate}kbps`;
}
