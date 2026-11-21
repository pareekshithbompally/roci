/** The knowledge graph's entity kinds: what a memory can be about and what a meeting's analysis names. The store's own list
 *  (ENTITY_KINDS in src-tauri/plugins/tauri-plugin-store/src/knowledge.rs) is the same, and refuses any other. */

export const ENTITY_KINDS = ['person', 'organization', 'project', 'event', 'topic'] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

/** Longest memory and entity name, in characters: the store's (MAX_CHARS in memories.rs, MAX_NAME_CHARS in knowledge.rs). */
export const KNOWLEDGE_LIMITS = { memory: 500, name: 100 } as const;

/** The knowledge graph on screen (Memory › Graph, a meeting's Related tab): each kind's colour token, what the legend calls
 *  it, and the words around it. Memories show smallest, beside what they are about. */
export const KNOWLEDGE_GRAPH = {
  kindTokens: {
    person: '--viz-1',
    organization: '--viz-2',
    project: '--viz-3',
    event: '--viz-4',
    topic: '--viz-7',
    meeting: '--text-muted',
    fact: '--text-accent',
  } satisfies Record<EntityKind | 'meeting' | 'fact', string>,
  smallKind: 'fact',
  /** Structural links, never written on the line: a meeting's "discussed", a memory's "about". */
  quietRelations: ['discussed', 'about'],
  legend: [
    { kind: 'person', label: 'People' },
    { kind: 'organization', label: 'Organizations' },
    { kind: 'project', label: 'Projects' },
    { kind: 'event', label: 'Events' },
    { kind: 'topic', label: 'Topics' },
    { kind: 'meeting', label: 'Meetings' },
    { kind: 'fact', label: 'Memories' },
  ],
  /** A meeting's tab. */
  tab: 'Related',
  copy: {
    label: 'Knowledge graph',
    emptyTitle: 'Nothing linked yet',
    emptyAll: 'People, projects and topics appear here as meetings are summarized and memories are saved.',
    emptyMeeting: 'Summarize this meeting again to find who and what it discussed, and the meetings it links to.',
    known: 'What You Approved',
    relations: 'Relations',
    meetings: 'Meetings',
    alsoIn: 'Also Discussed In',
    alsoInFooter: 'Other meetings that discussed the same people, projects or topics.',
    shared: (names: readonly string[]) => names.join(', '),
  },
} as const;
