/** Read-aloud engine (macOS system voices or a downloaded voice model) and its voice. */

export const READ_ALOUD_CONFIG = {
  /** The system voices' engine. */
  macos: { id: 'macos', provider: 'apple', label: 'macOS voices', hint: 'Built in' },
  /** Spoken until another engine is chosen: ready with no download. */
  defaultEngine: 'macos',
  /** What the voice picker's play button says. */
  sampleText: 'Hi! This is how your replies will sound when Roci reads them aloud.',
  /** Rust → webview: request `id` is now speaking `text`, one chunk of the reply (`{ id, text }`). */
  chunkEvent: 'tts://chunk',
  /** The CSS highlight the spoken chunk is drawn with (`::highlight(read-aloud)` in index.css). */
  highlight: 'read-aloud',
} as const;

/** `macos`, or a downloaded voice model's id (`pocket-tts`). */
export type ReadAloudEngine = string;
