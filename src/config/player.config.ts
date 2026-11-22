/** Audio playback: skip and arrow-key steps, the speed menu, and the waveform's bars and hover label. */

export const PLAYER_CONFIG = {
  /** Skip back / forward buttons, in seconds. */
  skipSeconds: 15,
  /** Left / right arrow keys, in seconds. */
  seekSeconds: 5,
  /** Up / down arrow keys, as a share of full volume. */
  volumeStep: 0.1,
  speeds: [0.5, 0.75, 1, 1.25, 1.5, 2],
  waveform: { barWidth: 3, barGap: 2, barRadius: 2, labelSize: '10px' },
  copy: {
    playFailed: "Couldn't play this audio",
    player: 'Audio player',
    play: 'Play',
    pause: 'Pause',
    mute: 'Mute',
    unmute: 'Unmute',
    skipBack: (seconds: number) => `Skip back ${seconds} seconds`,
    skipForward: (seconds: number) => `Skip forward ${seconds} seconds`,
    speed: (rate: number) => `Playback speed ${rate}x`,
    showElapsed: 'Show elapsed time',
    showRemaining: 'Show remaining time',
  },
} as const;
