/**
 * Searches meetings and chats — the one search behind the Mac's ⌘K panel and the iPhone sidebar's search field: titles
 * match at once from the first letter; the search index then adds the matches inside transcripts and messages below them
 * (with where they matched), never reordering what is already shown. Null while there is no query.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { vectorDB } from '@extensions/rag/client';
import type { SessionSearchHit } from '@extensions/rag/client';
import { SESSION_SEARCH_DEBOUNCE_MS, SESSION_SEARCH_MIN_QUERY_LENGTH, SESSION_SEARCH_LIMIT } from '@config/chat.config';
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
  /** Kinds the index may have cut short at the limit (more matches than shown). */
  capped: Array<UnifiedSidebarItem['type']>;
}

const keyOf = (type: string, id: string) => `${type}:${id}`;

/** In-memory title match: instant, and covers items the index hasn't seen yet. */
const titleMatches = (items: UnifiedSidebarItem[], query: string) => items.filter((item) => matchesAllWords(item.title, query));

const titleMatch = (item: UnifiedSidebarItem): SessionMatch => ({ item, excerpt: '' });

/** An index hit for an item the list hasn't loaded (beyond the most recent): enough to show and open it. */
function itemFromHit(hit: SessionSearchHit): UnifiedSidebarItem {
  const base = { id: hit.source_id, type: hit.source_type, title: hit.title, timestamp: hit.timestamp };
  return hit.source_type === 'meeting' ? { ...base, historyItem: { ...base, categories: [], transcript: '', summary: '' } } : base;
}

/** The index's hits that the title match didn't already list: matches inside transcripts and messages, with where they matched. */
function contentOnly(items: UnifiedSidebarItem[], hits: SessionSearchHit[], titles: UnifiedSidebarItem[]): SessionMatch[] {
  const byKey = new Map(items.map((item) => [keyOf(item.type, item.id), item]));
  const listed = new Set(titles.map((item) => keyOf(item.type, item.id)));
  return hits.flatMap((hit) => {
    const key = keyOf(hit.source_type, hit.source_id);
    return listed.has(key) ? [] : [{ item: byKey.get(key) ?? itemFromHit(hit), excerpt: hit.excerpt }];
  });
}

/** Kinds whose title or content hits reached the limit: the index may hold more. */
function cappedKinds(hits: SessionSearchHit[], limit: number): Array<UnifiedSidebarItem['type']> {
  const counts = new Map<string, number>();
  for (const hit of hits) counts.set(`${hit.source_type}:${hit.match_type}`, (counts.get(`${hit.source_type}:${hit.match_type}`) ?? 0) + 1);
  return (['meeting', 'chat'] as const).filter((type) => (counts.get(`${type}:title`) ?? 0) >= limit || (counts.get(`${type}:content`) ?? 0) >= limit);
}

/** `limit`: matches the index returns per kind (more for a full list, "Show all"). */
export function useSessionSearch(items: UnifiedSidebarItem[], query: string, limit: number = SESSION_SEARCH_LIMIT): SessionSearch {
  const trimmed = query.trim();
  const typed = trimmed.length > 0;
  // Titles match from the first letter; the index is asked from the minimum length.
  const asksIndex = trimmed.length >= SESSION_SEARCH_MIN_QUERY_LENGTH;
  const titles = useMemo(() => (typed ? titleMatches(items, trimmed) : []), [typed, items, trimmed]);
  const [indexed, setIndexed] = useState<{ query: string; matches: SessionMatch[]; capped: Array<UnifiedSidebarItem['type']> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Responses for older queries are dropped.
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    if (!asksIndex) return;
    const timer = setTimeout(() => {
      vectorDB.searchSessions({ query: trimmed, limit })
        .then((hits) => {
          if (gen !== generation.current) return;
          setError(null);
          setIndexed({ query: trimmed, matches: contentOnly(items, hits, titles), capped: cappedKinds(hits, limit) });
        })
        .catch((err: unknown) => {
          console.error('[useSessionSearch] Index search failed:', err);
          if (gen === generation.current) setError('Search index unavailable');
        });
    }, SESSION_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [asksIndex, trimmed, items, titles, limit]);

  if (!typed) return { matches: null, searching: false, error: null, capped: [] };
  const answered = indexed?.query === trimmed;
  // Title matches stay where they are; content matches sit below them. While the next letter is searched the last
  // answer stays on screen (without any row the titles now list), so rows never blink out and back.
  const listed = new Set(titles.map((item) => keyOf(item.type, item.id)));
  const content = asksIndex ? (indexed?.matches ?? []).filter(({ item }) => answered || !listed.has(keyOf(item.type, item.id))) : [];
  const matches = [...titles.map(titleMatch), ...content];
  return { matches, searching: asksIndex && !answered && !error, error, capped: answered ? indexed.capped : [] };
}
