/** Read-aloud engine (macOS system voices or a downloaded voice model) and its voice. */

export const READ_ALOUD_CONFIG = {
  /** The system voices' engine. */
  macos: { id: 'macos', provider: 'apple', label: 'macOS voices', hint: 'Built in' },
  /** The one downloadable voice model (Apache-2.0), offered on the Home card too. */
  phonon: { modelId: 'phonon-31m', repoUrl: 'https://huggingface.co/gradium/phonon-31m-en' },
  /** Spoken until another engine is chosen: ready with no download. */
  defaultEngine: 'macos',
  /** What the voice picker's play button says. */
  sampleText: 'Hi! This is how your replies will sound when Roci reads them aloud.',
  /** Rust → webview: request `id` is now speaking `text`, one chunk of the reply (`{ id, text }`). */
  chunkEvent: 'tts://chunk',
  /** The CSS highlight the spoken chunk is drawn with (`::highlight(read-aloud)` in index.css). */
  highlight: 'read-aloud',
} as const;

/** `macos`, or a downloaded voice model's id (`phonon-31m`). */
export type ReadAloudEngine = string;
