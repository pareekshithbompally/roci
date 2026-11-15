/** Text roles (macOS text styles); sizes live in tailwind.config.js `fontSize`, features pick a role. */

export const TYPOGRAPHY_CLASSES = {
  /** 11 — timestamps, counts, fine print */
  caption: 'text-subheadline font-normal',
  /** 12 / 500 — section labels, small buttons, field labels */
  label: 'text-callout font-medium',
  /** 12 — helper and secondary copy */
  helper: 'text-callout font-normal',
  /** 13 — default UI text: rows, inputs, descriptions */
  body: 'text-body font-normal',
  /** 13 / 500 — row titles, emphasised body */
  bodyStrong: 'text-body font-medium',
  /** 13 / 600 — headline */
  headline: 'text-body font-semibold',
  /** 14 — long-form reading: chat messages, transcript, summary */
  reading: 'text-reading font-normal',
  /** 15 / 600 — panel and section titles */
  title: 'text-title3 font-semibold',
  /** 12 mono — code paths, durations, tool arguments */
  mono: 'text-callout font-mono',
  /** 26 / 600 — hero greeting (macOS large title) */
  display: 'text-largeTitle font-semibold',
  /** 17 / 600 — page titles */
  pageTitle: 'text-title2 font-semibold',
} as const;
