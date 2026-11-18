/** Read-aloud engine (macOS system voices or a downloaded voice model) and its voice. */

import { platform } from '@platform/index';

export const READ_ALOUD_CONFIG = {
  /** The system voices' engine. */
  /** The system's own voices (`id` predates iPhone support and stays, so saved choices keep working). */
  system: { id: 'macos', provider: 'apple', label: `${platform.systemName} voices`, hint: 'Built in' },
  /** Spoken until another engine is chosen: ready with no download. */
  defaultEngine: 'macos',
  /** What the voice picker's play button says. */
  sampleText: 'Hi! This is how your replies will sound when Roci reads them aloud.',
  /** Rust → webview: request `id` is now speaking `text`, one chunk of the reply (`{ id, text }`). */
  chunkEvent: 'tts://chunk',
  /** The CSS highlight the spoken chunk is drawn with (`::highlight(read-aloud)` in index.css). */
  highlight: 'read-aloud',
  /** Cloud voice models: the providers whose AI SDK speaks (`createSpeechModel`), each with its voices, default first. */
  cloud: {
    openai: { voices: ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'] },
    gemini: { voices: ['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr'] },
  } as Record<string, { voices: readonly string[] }>,
  /** Longest text sent to a cloud voice in one request (characters, under OpenAI's 4096); a reply is read in sentence chunks of this size. */
  cloudChunkChars: 2000,
} as const;

/** `macos`, or a downloaded voice model's id (`pocket-tts`). */
export type ReadAloudEngine = string;
