/** The ⌘K command palette (src/features/palette): its groups, limits and timing. */

export const PALETTE_CONFIG = {
  /** Group titles, in the order they appear before anything is typed (Recent first). */
  groups: {
    recent: 'Recent',
    actions: 'Actions',
    navigate: 'Go to',
    settings: 'Settings',
    meetings: 'Meetings',
    chats: 'Chats',
  },
  /** Recent meetings and chats shown before anything is typed. */
  recentCount: 5,
  /** Search results of one kind shown before "Show all N". */
  resultsPerKind: 5,
  /** Go to rows sink below real matches once something is typed. */
  navigateWeight: 0.7,
} as const;
