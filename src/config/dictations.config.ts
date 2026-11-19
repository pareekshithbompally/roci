/** Dictations: every dictation made in the app, newest first, searchable by its words. */

export const DICTATIONS_CONFIG = {
  /** Sidebar row and page title. */
  title: 'Dictations',
  empty: 'Dictations you make appear here.',
  searchPlaceholder: 'Search dictations',
  noMatch: 'No dictations match',
  /** How many the page loads (newest first). */
  listLimit: 500,
  /** Mac: the list column beside the selected dictation. */
  listColumn: 'w-80 shrink-0',
} as const;
