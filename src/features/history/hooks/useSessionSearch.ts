/**
 * Searches meetings and chats for the sidebar: an instant title match, then the search index (which also finds words
 * inside transcripts and messages). Returns the matching sidebar items in rank order, or null while there is no query.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { vectorDB } from '@extensions/rag/client';
import type { SpotlightHit } from '@extensions/rag/client';
import { SPOTLIGHT_DEBOUNCE_MS, SPOTLIGHT_MIN_QUERY_LENGTH, SPOTLIGHT_RESULTS_PER_SOURCE } from '@config/chat.config';
import type { UnifiedSidebarItem } from '@shared/types';

export interface SessionSearch {
  /** Matching items, best first; null when the query is too short to search. */
  matches: UnifiedSidebarItem[] | null;
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

/** Index hits first (they match inside content), then title matches the index missed; each item once. */
function rank(items: UnifiedSidebarItem[], hits: SpotlightHit[], titles: UnifiedSidebarItem[]): UnifiedSidebarItem[] {
  const byKey = new Map(items.map((item) => [keyOf(item.type, item.id), item]));
  const fromIndex = hits.map((hit) => byKey.get(keyOf(hit.source_type, hit.source_id))).filter((item): item is UnifiedSidebarItem => !!item);
  const seen = new Set(fromIndex.map((item) => keyOf(item.type, item.id)));
  return [...fromIndex, ...titles.filter((item) => !seen.has(keyOf(item.type, item.id)))];
}

export function useSessionSearch(items: UnifiedSidebarItem[], query: string): SessionSearch {
  const trimmed = query.trim();
  const active = trimmed.length >= SPOTLIGHT_MIN_QUERY_LENGTH;
  const titles = useMemo(() => (active ? titleMatches(items, trimmed) : []), [active, items, trimmed]);
  const [indexed, setIndexed] = useState<{ query: string; items: UnifiedSidebarItem[] } | null>(null);
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
          setIndexed({ query: trimmed, items: rank(items, hits, titles) });
        })
        .catch((err: unknown) => {
          console.error('[useSessionSearch] Index search failed:', err);
          if (gen === generation.current) setError('Search index unavailable');
        });
    }, SPOTLIGHT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [active, trimmed, items, titles]);

  if (!active) return { matches: null, searching: false, error: null };
  const current = indexed?.query === trimmed ? indexed.items : null;
  return { matches: current ?? titles, searching: current === null && !error, error };
}
