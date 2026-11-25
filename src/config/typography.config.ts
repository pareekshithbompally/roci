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
  /** A running clock: 12 inline on a Mac, a 40 pt light timer on a phone (tokens.css `--fs-timer`), tabular digits. */
  timer: 'text-timer tabular-nums',
  /** 13 — a group's heading above its card (semibold on macOS, regular on iOS: tokens.css `--fw-section`) */
  section: 'text-section',
  /** 13 / 600 — headline */
  headline: 'text-body font-semibold',
  /** 14 — long-form reading: chat messages, transcript, summary */
  reading: 'text-reading font-normal',
  /** Title 2 with open leading — live dictation: the words as they're spoken, larger than the reply text they'll become */
  spoken: 'text-spoken font-normal',
  /** 15 — a summary's opening paragraph, read before anything else on the page */
  lead: 'text-title3 font-normal',
  /** 15 / 600 — panel and section titles */
  title: 'text-title3 font-semibold',
  /** 13 tabular — figures in a column (costs, counts) that must line up */
  figure: 'text-body font-normal tabular-nums whitespace-nowrap',
  /** 12 tabular — inline numbers (percent, times, token counts): the UI font with even-width digits */
  figureSmall: 'text-callout font-normal tabular-nums',
  /** 12 mono — code: paths, tool names and arguments, error text */
  mono: 'text-callout font-mono',
  /** The home screen's greeting: a Mac's large title (26 / 600), a phone's Title 2 (22 / 600). */
  greeting: 'text-greeting font-semibold',
  /** Large title / 600 — a screen's navigation title (Settings), a big figure */
  display: 'text-largeTitle font-semibold',
  /** 17 / 600 — page titles */
  pageTitle: 'text-title2 font-semibold',
} as const;
