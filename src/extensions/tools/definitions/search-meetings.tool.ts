/** search_meetings: hybrid search over meeting transcripts, summaries and notes, ranked snippets with meeting IDs. */

import { z } from 'zod';
import type { MeetingCitation } from '@extensions/tools/types';
import { defineTool, fail, limit, ok, text, toolDate } from '@extensions/tools/contract';
import { currentMeetings } from '@extensions/tools/data';
import { ragSearcher } from '@extensions/rag/searcher';
import { ragIndexer } from '@extensions/rag/indexer';
import { vectorDB } from '@extensions/rag/client';
import { SCORE_HIGH, SCORE_MEDIUM } from '@extensions/rag/constants';
import { errorMessage } from '@shared/utils/errors';

export const searchMeetingsTool = defineTool({
  name: 'search_meetings',
  description:
    "Search the user's own meetings (transcripts, summaries and notes) by meaning and keywords; not for general " +
    "knowledge. Returns the best matches, each with a snippet and the meeting's ID. Use it for what was said, decided " +
    'or promised about a topic or person. Read a meeting with get_meeting only when the snippets do not answer. ' +
    'To find meetings by date, use list_meetings.',
  input: z.object({
    query: text('What to look for: topics, names, keywords.'),
    limit: limit(5, 20),
  }),

  async execute({ query, limit: count }, context) {
    let results;
    try {
      // Ensure store is initialized and meetings are indexed
      await vectorDB.initialize();
      const meetings = await currentMeetings();
      const stale = await ragIndexer.needsReindex(meetings);
      if (stale.length > 0) {
        await ragIndexer.indexAll(meetings, context.signal);
      }

      results = await ragSearcher.search(query, { limit: count, mode: 'hybrid' });
    } catch (error) {
      console.error('[SearchMeetingsTool] Search failed:', error);
      return fail(`Search failed: ${errorMessage(error)}`);
    }

    if (results.length === 0) {
      return ok('No meetings match that search. Try other words, or list_meetings to browse by date.', { resultCount: 0 });
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
      const date = toolDate(first.created_at);
      const snippet = first.chunkText.slice(0, 200).replace(/\n/g, ' ');
      const confidence = first.score >= SCORE_HIGH ? 'high' : first.score >= SCORE_MEDIUM ? 'medium' : 'low';

      lines.push(
        `${index}. "${first.meetingTitle}" (${date})`,
        `   Relevance: ${confidence} | Match: "${snippet}..."`,
        `   Meeting ID: ${first.meetingId}`,
        '',
      );
    }

    // Citation cards for high-confidence matches only, so Sources shows truly relevant meetings.
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

    return ok(lines.join('\n'), { resultCount: byMeeting.size, citations });
  },
});
