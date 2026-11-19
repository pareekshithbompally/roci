/**
 * Searches meetings and chats — the one search behind the Mac's ⌘K panel and the iPhone sidebar's search field: titles
 * match at once from the first letter; the search index then adds the matches inside transcripts and messages below them
 * (with where they matched), never reordering what is already shown. Null while there is no query.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { vectorDB } from '@extensions/rag/client';
import type { SpotlightHit } from '@extensions/rag/client';
import { SPOTLIGHT_DEBOUNCE_MS, SPOTLIGHT_MIN_QUERY_LENGTH, SPOTLIGHT_RESULTS_PER_SOURCE } from '@config/chat.config';
import { matchesAllWords } from '@shared/utils/textMatch';
import type { UnifiedSidebarItem } from '@shared/types';

export interface SessionMatch {
  item: UnifiedSidebarItem;
  /** Where the words matched, `<<MARK>>`-wrapped (search index); empty for a title match. */
  excerpt: string;
}

export interface SessionSearch {
  /** Matches, best first; null when the query is too short to search. */
  matches: SessionMatch[] | null;
  /** A search for the current query is still running. */
  searching: boolean;
  /** The index couldn't be read; title matches still show. */
  error: string | null;
}

const keyOf = (type: string, id: string) => `${type}:${id}`;

/** In-memory title match: instant, and covers items the index hasn't seen yet. */
const titleMatches = (items: UnifiedSidebarItem[], query: string) => items.filter((item) => matchesAllWords(item.title, query));

const titleMatch = (item: UnifiedSidebarItem): SessionMatch => ({ item, excerpt: '' });

/** The index's hits that the title match didn't already list: matches inside transcripts and messages, with where they matched. */
function contentOnly(items: UnifiedSidebarItem[], hits: SpotlightHit[], titles: UnifiedSidebarItem[]): SessionMatch[] {
  const byKey = new Map(items.map((item) => [keyOf(item.type, item.id), item]));
  const listed = new Set(titles.map((item) => keyOf(item.type, item.id)));
  return hits.flatMap((hit) => {
    const key = keyOf(hit.source_type, hit.source_id);
    const item = byKey.get(key);
    return item && !listed.has(key) ? [{ item, excerpt: hit.excerpt }] : [];
  });
}

export function useSessionSearch(items: UnifiedSidebarItem[], query: string): SessionSearch {
  const trimmed = query.trim();
  const typed = trimmed.length > 0;
  // Titles match from the first letter; the index is asked from the minimum length.
  const asksIndex = trimmed.length >= SPOTLIGHT_MIN_QUERY_LENGTH;
  const titles = useMemo(() => (typed ? titleMatches(items, trimmed) : []), [typed, items, trimmed]);
  const [indexed, setIndexed] = useState<{ query: string; matches: SessionMatch[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Responses for older queries are dropped.
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    if (!asksIndex) return;
    const timer = setTimeout(() => {
      vectorDB.spotlightSearch({ query: trimmed, limit: SPOTLIGHT_RESULTS_PER_SOURCE })
        .then((hits) => {
          if (gen !== generation.current) return;
          setError(null);
          setIndexed({ query: trimmed, matches: contentOnly(items, hits, titles) });
        })
        .catch((err: unknown) => {
          console.error('[useSessionSearch] Index search failed:', err);
          if (gen === generation.current) setError('Search index unavailable');
        });
    }, SPOTLIGHT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [asksIndex, trimmed, items, titles]);

  if (!typed) return { matches: null, searching: false, error: null };
  const answered = indexed?.query === trimmed;
  // Title matches stay where they are; content matches are only ever added below them, so no row moves.
  const matches = [...titles.map(titleMatch), ...(answered ? indexed.matches : [])];
  return { matches, searching: asksIndex && !answered && !error, error };
}
