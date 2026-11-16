/** Storage layout, file naming and cache policies for binary files; data lives in roci.db. */

export const StorageConfig = {
  appName: 'Roci AI',

  /** Directory structure within Application Support. */
  directories: {
    recordings: 'recordings',
    cache: 'cache',
    cacheAudio: 'cache/audio',
    cacheApi: 'cache/api',
  },

  fileNames: {
    recordingPrefix: 'rec',
    cacheTempPrefix: 'temp',
  },

  formats: {
    recording: {
      defaultExtension: '.wav',
      allowedExtensions: ['.wav', '.webm', '.mp3', '.m4a'],
    },
  },

  cache: {
    audio: {
      ttlHours: 24,
      maxSizeMB: -1,
      cleanupOnStart: true,
    },
    api: {
      ttlDays: 7,
      maxSizeMB: 100,
      cleanupOnStart: true,
    },
    cleanupThresholdPercent: 90,
  },

  /** Retry policy for file operations. */
  retry: {
    maxAttempts: 3,
    initialDelayMs: 100,
    backoffMultiplier: 2,
  },

  metadataVersion: 1,

  /** Maximum entries to keep in history. */
  maxHistoryEntries: 1000,

  defaultSettings: {
    theme: 'system',
    autoSave: true,
    recordingQuality: 'high',
    aiModel: '',
    chatModel: '',
    autoTranscribe: true,
    defaultAudioSource: 'systemAndMicrophone',
  },
} as const;

export function generateRecordingFilename(extension?: string): string {
  const timestamp = Date.now();
  const uuid = crypto.randomUUID().split('-')[0];
  const ext = extension || StorageConfig.formats.recording.defaultExtension;
  return `${StorageConfig.fileNames.recordingPrefix}_${timestamp}_${uuid}${ext}`;
}

export function getRecordingIdFromFilename(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex <= 0) {
    return filename;
  }
  return filename.slice(0, lastDotIndex);
}

export function generateCacheFilename(key: string, extension: string = '.cache'): string {
  const hash = key.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0).toString(36);
  return `${StorageConfig.fileNames.cacheTempPrefix}_${hash}${extension}`;
}
