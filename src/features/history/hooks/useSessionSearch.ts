/**
 * Searches meetings and chats — the one search behind the Mac's ⌘K panel and the iPhone sidebar's search field: an
 * instant title match, then the search index (which also finds words inside transcripts and messages). Returns the
 * matches in rank order, each with the index's excerpt, or null while there is no query.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { vectorDB } from '@extensions/rag/client';
import type { SpotlightHit } from '@extensions/rag/client';
import { SPOTLIGHT_DEBOUNCE_MS, SPOTLIGHT_MIN_QUERY_LENGTH, SPOTLIGHT_RESULTS_PER_SOURCE } from '@config/chat.config';
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
function titleMatches(items: UnifiedSidebarItem[], query: string): UnifiedSidebarItem[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => tokens.every((token) => item.title.toLowerCase().includes(token)));
}

const titleMatch = (item: UnifiedSidebarItem): SessionMatch => ({ item, excerpt: '' });

/** Index hits first (they match inside content), then title matches the index missed; each item once. */
function rank(items: UnifiedSidebarItem[], hits: SpotlightHit[], titles: UnifiedSidebarItem[]): SessionMatch[] {
  const byKey = new Map(items.map((item) => [keyOf(item.type, item.id), item]));
  const fromIndex = hits.flatMap((hit) => {
    const item = byKey.get(keyOf(hit.source_type, hit.source_id));
    return item ? [{ item, excerpt: hit.excerpt }] : [];
  });
  const seen = new Set(fromIndex.map(({ item }) => keyOf(item.type, item.id)));
  return [...fromIndex, ...titles.filter((item) => !seen.has(keyOf(item.type, item.id))).map(titleMatch)];
}

export function useSessionSearch(items: UnifiedSidebarItem[], query: string): SessionSearch {
  const trimmed = query.trim();
  const active = trimmed.length >= SPOTLIGHT_MIN_QUERY_LENGTH;
  const titles = useMemo(() => (active ? titleMatches(items, trimmed) : []), [active, items, trimmed]);
  const [indexed, setIndexed] = useState<{ query: string; matches: SessionMatch[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Responses for older queries are dropped.
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    if (!active) return;
    const timer = setTimeout(() => {
      vectorDB.spotlightSearch({ query: trimmed, limit: SPOTLIGHT_RESULTS_PER_SOURCE })
        .then((hits) => {
          if (gen !== generation.current) return;
          setError(null);
          setIndexed({ query: trimmed, matches: rank(items, hits, titles) });
        })
        .catch((err: unknown) => {
          console.error('[useSessionSearch] Index search failed:', err);
          if (gen === generation.current) setError('Search index unavailable');
        });
    }, SPOTLIGHT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [active, trimmed, items, titles]);

  if (!active) return { matches: null, searching: false, error: null };
  const current = indexed?.query === trimmed ? indexed.matches : null;
  return { matches: current ?? titles.map(titleMatch), searching: current === null && !error, error };
}
