/**
 * search_meetings tool
 *
 * Wraps the existing RAG hybrid search (sqlite-vec KNN + FTS5 + RRF).
 * Returns ranked meeting snippets the LLM can use to decide which
 * meetings to load in full via get_meeting.
 */

import type { ToolDefinition, ToolResult, MeetingCitation } from '../types';
import { ragSearcher } from '../../rag/searcher';
import { ragIndexer } from '../../rag/indexer';
import { vectorDB } from '../../rag/client';
import { SCORE_HIGH, SCORE_MEDIUM } from '../../rag/constants';

export const searchMeetingsTool: ToolDefinition = {
  name: 'search_meetings',
  description:
    'Search across the user\'s recorded meeting transcripts, summaries, and notes ' +
    'using semantic + keyword hybrid search. Returns ranked snippets with meeting IDs. ' +
    'Use when the user asks about specific meetings, discussions, people, or decisions ' +
    'from their work. After getting results, use get_meeting to load full details.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query. Be specific — include keywords, topics, or names.',
      },
      limit: {
        type: 'integer',
        description: 'Maximum number of results to return.',
        default: 5,
        minimum: 1,
        maximum: 20,
      },
    },
    required: ['query'],
  },

  async execute(params, context): Promise<ToolResult> {
    const query = params.query as string;
    const limit = (params.limit as number) ?? 5;

    let results;
    try {
      // Ensure vectordb is initialized and meetings are indexed
      await vectorDB.initialize();
      const stale = await ragIndexer.needsReindex(context.historyItems);
      if (stale.length > 0) {
        await ragIndexer.indexAll(context.historyItems, context.signal);
      }

      results = await ragSearcher.search(query, { limit, mode: 'hybrid' });
    } catch (error) {
      console.error('[SearchMeetingsTool] Search failed:', error);
      return {
        toolCallId: '',
        content: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
        meta: { toolName: 'search_meetings', executionMs: 0 },
      };
    }

    if (results.length === 0) {
      return {
        toolCallId: '',
        content: 'No meetings found matching that query.',
        isError: false,
        meta: { toolName: 'search_meetings', executionMs: 0, resultCount: 0 },
      };
    }

    // Group by meeting to show deduplicated entries
    const byMeeting = new Map<string, typeof results>();
    for (const r of results) {
      const existing = byMeeting.get(r.meetingId) ?? [];
      existing.push(r);
      byMeeting.set(r.meetingId, existing);
    }

    let index = 0;
    const lines: string[] = [`Found ${byMeeting.size} relevant meeting(s):\n`];

    for (const [, hits] of byMeeting) {
      index++;
      const first = hits[0];
      const date = new Date(first.timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      const snippet = first.chunkText.slice(0, 200).replace(/\n/g, ' ');
      const confidence = first.score >= SCORE_HIGH ? 'high' : first.score >= SCORE_MEDIUM ? 'medium' : 'low';

      lines.push(
        `${index}. "${first.meetingTitle}" (${date})`,
        `   Relevance: ${confidence} | Match: "${snippet}..."`,
        `   Meeting ID: ${first.meetingId}`,
        '',
      );
    }

    // Build UI-only citation cards — only high-confidence matches
    // so Sources shows the truly relevant meetings, not every vague hit.
    const citations: MeetingCitation[] = [];
    for (const [, hits] of byMeeting) {
      const first = hits[0];
      if (first.score >= SCORE_HIGH) {
        citations.push({
          meetingId: first.meetingId,
          meetingTitle: first.meetingTitle,
          meetingTimestamp: first.timestamp,
          excerpt: first.chunkText.slice(0, 300),
          score: first.score,
        });
      }
    }

    return {
      toolCallId: '',
      content: lines.join('\n'),
      isError: false,
      meta: { toolName: 'search_meetings', executionMs: 0, resultCount: byMeeting.size, citations },
    };
  },
};
