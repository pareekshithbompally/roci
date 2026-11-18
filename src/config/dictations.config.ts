/** Dictations: every dictation made in the app, newest first, grouped by day. */

export const DICTATIONS_CONFIG = {
  /** Sidebar row and page title. */
  title: 'Dictations',
  empty: 'Dictations you make appear here.',
  /** How many the page loads (newest first). */
  listLimit: 500,
  /** Mac: the list column beside the selected dictation. */
  listColumn: 'w-80 shrink-0',
} as const;
