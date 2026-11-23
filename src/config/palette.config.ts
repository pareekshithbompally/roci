/** The ⌘K command palette (src/features/palette): its groups, limits and timing. */

export const PALETTE_CONFIG = {
  /** Group titles, in the order they appear before anything is typed (Recent first). */
  groups: {
    recent: 'Recent',
    actions: 'Actions',
    navigate: 'Go To',
    settings: 'Settings',
    meetings: 'Meetings',
    chats: 'Chats',
  },
  /** Recent meetings and chats shown before anything is typed. */
  recentCount: 5,
  /** Search results of one kind shown before "Show All N". */
  resultsPerKind: 5,
  /** How many of one kind the index is asked for inside Show All. */
  allResultsLimit: 200,
  /** iPhone's full-screen search (SearchScreen): its words. */
  phone: {
    placeholder: 'Search meetings and chats',
    hint: 'Titles, transcripts and chats',
    searching: 'Searching…',
    none: (term: string) => `No results for “${term}”`,
  },
  /** Go to rows sink below real matches once something is typed. */
  navigateWeight: 0.7,
} as const;
