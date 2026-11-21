/** Storage layout: the asset kinds (each file one row in roci.db), Keep policies, removed copy, and the cache. */

export const StorageConfig = {
  /** Directory structure within Application Support. */
  directories: {
    cache: 'cache',
    cacheAudio: 'cache/audio',
    cacheApi: 'cache/api',
    /** Copies of chat attachments handed to another app to open (Preview, Pages …); emptied at launch. */
    cacheOpen: 'cache/open',
  },

  /** Every kept file kind by its folder; `assets.rs` MANAGED_DIRS and the tauri.conf.json asset scope list the same. */
  assetKinds: {
    recording: { dir: 'recordings' },
    image: { dir: 'images' },
    speech: { dir: 'speech' },
  },

  /** Settings › Storage › Keep: how long each class of data stays. A class absent from the setting is kept forever. */
  retention: {
    /** The Keep menu's periods, in days. */
    keepDays: [30, 90, 120],
    /** The longest a deadline timer can wait (setTimeout's limit); a later deadline re-arms when it fires. */
    maxTimerMs: 2 ** 31 - 1,
    /** Settings › Storage rows, in order: what each class is called, counts as, and what Delete All removes. */
    classes: [
      { id: 'meetings', label: 'Meetings', noun: 'meeting', deletes: 'every meeting with its transcript, summary, notes, to-dos and audio' },
      { id: 'recording', label: 'Recordings', noun: 'recording', deletes: 'the audio of every meeting; the meetings and their transcripts stay' },
      { id: 'chats', label: 'Chats', noun: 'chat', deletes: 'every chat with its images and speech' },
      { id: 'image', label: 'Images', noun: 'image', deletes: 'every image made in chat; the chats stay' },
      { id: 'dictations', label: 'Dictations', noun: 'dictation', deletes: 'every dictation' },
    ],
    /** The Keep menu's last group: an action, not a period. */
    deleteAll: 'Delete All…',
    forever: 'Forever',
    footer: 'Older items are removed automatically. Meetings still recording or transcribing are never removed.',
  },

  /** What stands where a removed item was (Keep or Delete All took it); its parent stays. */
  removed: {
    image: 'Image removed',
    audio: 'Audio removed',
    video: 'Video removed',
    document: 'File removed',
    meeting: 'Meeting removed',
  },

  /** The models.dev catalog: kept in app data until a newer one is fetched, never in the clearable cache. */
  modelCatalog: {
    file: 'models-dev.json',
    /** Older than this, the app fetches a fresh one in the background and keeps using the one it has. */
    refreshAfterMs: 24 * 60 * 60 * 1000,
  },

  fileNames: {
    cacheTempPrefix: 'temp',
  },

  cache: {
    audio: {
      ttlHours: 24,
      maxSizeMB: -1,
    },
    api: {
      ttlDays: 7,
      maxSizeMB: 100,
    },
    cleanupThresholdPercent: 90,
  },
} as const;

export function generateCacheFilename(key: string, extension: string = '.cache'): string {
  const hash = key.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0).toString(36);
  return `${StorageConfig.fileNames.cacheTempPrefix}_${hash}${extension}`;
}
