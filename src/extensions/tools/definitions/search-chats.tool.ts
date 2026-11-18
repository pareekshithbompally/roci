/** search_chats: hybrid search over the user's earlier chats, ranked excerpts with chat IDs. */

import { z } from 'zod';
import { defineTool, fail, limit, ok, text, toolDate } from '@extensions/tools/contract';
import { chatSearcher } from '@extensions/rag/chat-searcher';
import { vectorDB } from '@extensions/rag/client';
import { SCORE_HIGH, SCORE_MEDIUM } from '@extensions/rag/constants';
import { errorMessage } from '@shared/utils/errors';

export const searchChatsTool = defineTool({
  name: 'search_chats',
  description:
    "Search the user's earlier chats with you by meaning and keywords. Returns matching excerpts, each with the " +
    "chat's ID. Use it when the user refers to an earlier chat; then read it with get_chat.",
  input: z.object({
    query: text('What to look for: topics, keywords, phrases.'),
    limit: limit(5, 20),
  }),

  async execute({ query, limit: count }) {
    let results;
    try {
      await vectorDB.initialize();
      results = await chatSearcher.search(query, { limit: count, mode: 'hybrid' });
    } catch (error) {
      return fail(`Chat search failed: ${errorMessage(error)}`);
    }

    if (results.length === 0) {
      return ok('No chats match that search. Try other words, or list_chats to browse.', { resultCount: 0 });
    }

    const lines: string[] = [`Found ${results.length} relevant chat(s):\n`];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const date = toolDate(r.lastMessageAt);
      const snippet = r.chunkText.slice(0, 200).replace(/\n/g, ' ');
      const confidence = r.score >= SCORE_HIGH ? 'high' : r.score >= SCORE_MEDIUM ? 'medium' : 'low';

      lines.push(
        `${i + 1}. "${r.sessionTitle}" (${date})`,
        `   Relevance: ${confidence} | Excerpt: "${snippet}..."`,
        `   Chat ID: ${r.sessionId}`,
        '',
      );
    }

    return ok(lines.join('\n'), { resultCount: results.length });
  },
});
