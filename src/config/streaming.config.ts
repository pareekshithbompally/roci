/** Chat streaming behaviour, layout and animation constants. */

export const STREAMING_CONFIG = {
  /** Base drain speed for buffer (20-50ms range) */
  DRAIN_INTERVAL_MS: 30,

  /** Buffer threshold to trigger adaptive speed */
  BUFFER_THRESHOLD_CHARS: 100,

  /** Speed multiplier when buffer exceeds threshold */
  ADAPTIVE_DRAIN_MULTIPLIER: 2,

  /** Look-ahead buffer for partial markdown syntax */
  MARKDOWN_BUFFER_CHARS: 10,

  /** Animated gradient ring rotation duration */
  LOADING_RING_DURATION_MS: 1500,
} as const;
