/**
 * search_chats tool
 *
 * Hybrid semantic + keyword search across the user's chat history.
 * Returns ranked excerpts the LLM can use to locate specific conversations.
 */

import type { ToolDefinition, ToolResult } from '@extensions/tools/types';
import { chatSearcher } from '@extensions/rag/chat-searcher';
import { vectorDB } from '@extensions/rag/client';
import { SCORE_HIGH, SCORE_MEDIUM } from '@extensions/rag/constants';

export const searchChatsTool: ToolDefinition = {
  name: 'search_chats',
  description:
    "Search across the user's chat conversation history using semantic + keyword hybrid search. " +
    'Returns ranked excerpts with session IDs. ' +
    'Use when the user asks about finding a specific chat, topic they discussed in a previous ' +
    'conversation, or something they worked on with the AI assistant. ' +
    'After getting results, use get_chat to load the full conversation.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query. Be specific — include topics, keywords, or phrases.',
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

  async execute(params): Promise<ToolResult> {
    const query = params.query as string;
    const limit = (params.limit as number) ?? 5;

    let results;
    try {
      await vectorDB.initialize();
      results = await chatSearcher.search(query, { limit, mode: 'hybrid' });
    } catch (error) {
      return {
        toolCallId: '',
        content: `Chat search failed: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
        meta: { toolName: 'search_chats', executionMs: 0 },
      };
    }

    if (results.length === 0) {
      return {
        toolCallId: '',
        content: 'No chats found matching that query.',
        isError: false,
        meta: { toolName: 'search_chats', executionMs: 0, resultCount: 0 },
      };
    }

    const lines: string[] = [`Found ${results.length} relevant chat(s):\n`];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const date = new Date(r.lastMessageAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
      const snippet = r.chunkText.slice(0, 200).replace(/\n/g, ' ');
      const confidence = r.score >= SCORE_HIGH ? 'high' : r.score >= SCORE_MEDIUM ? 'medium' : 'low';

      lines.push(
        `${i + 1}. "${r.sessionTitle}" (${date})`,
        `   Relevance: ${confidence} | Excerpt: "${snippet}..."`,
        `   Session ID: ${r.sessionId}`,
        '',
      );
    }

    return {
      toolCallId: '',
      content: lines.join('\n'),
      isError: false,
      meta: { toolName: 'search_chats', executionMs: 0, resultCount: results.length },
    };
  },
};
