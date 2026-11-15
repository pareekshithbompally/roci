/**
 * Read aloud — the voices a reply can be spoken in (src-tauri/src/tts): the
 * macOS system voice (built in, Apple's `say`) or a downloaded local voice
 * model (Phonon 31M), by its model id.
 */

export const READ_ALOUD_CONFIG = {
  /** The system voice: System Settings › Accessibility › Spoken Content. */
  macos: { id: 'macos', provider: 'apple', label: 'macOS voices', hint: 'Built in' },
  /** The one downloadable voice (Apache-2.0), offered on the Home card too. */
  phonon: { modelId: 'phonon-31m', repoUrl: 'https://huggingface.co/gradium/phonon-31m-en' },
  /** Spoken until another voice is chosen: ready with no download. */
  defaultVoice: 'macos',
} as const;

/** `macos`, or a downloaded voice model's id (`phonon-31m`). */
export type ReadAloudVoice = string;
