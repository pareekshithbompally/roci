/** list_chats: recent chat sessions with metadata, for when search_chats would be too broad. */

import type { ToolDefinition, ToolResult } from '@extensions/tools/types';
import { chatService } from '@services/chat.service';
import { errorMessage } from '@shared/utils/errors';

export const listChatsTool: ToolDefinition = {
  name: 'list_chats',
  description:
    "List the user's recent chat sessions with titles and dates. " +
    'Use when the user wants to browse their chat history or when they ' +
    'ask "what have I been chatting about recently?"',
  parameters: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        description: 'Maximum number of chats to list (most recent first).',
        default: 10,
        minimum: 1,
        maximum: 50,
      },
    },
    required: [],
  },

  async execute(params): Promise<ToolResult> {
    const limit = (params.limit as number) ?? 10;

    let sessions;
    try {
      const index = await chatService.listSessions();
      sessions = index.slice(0, limit);
    } catch (error) {
      return {
        toolCallId: '',
        content: `Failed to list chats: ${errorMessage(error)}`,
        isError: true,
        meta: { toolName: 'list_chats', executionMs: 0 },
      };
    }

    if (sessions.length === 0) {
      return {
        toolCallId: '',
        content: 'No chat sessions found.',
        isError: false,
        meta: { toolName: 'list_chats', executionMs: 0 },
      };
    }

    const lines: string[] = [`${sessions.length} recent chat(s):\n`];

    sessions.forEach((s, i) => {
      const date = new Date(s.lastMessageAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
      lines.push(`${i + 1}. "${s.title}" — ${date} (ID: ${s.id})`);
    });

    return {
      toolCallId: '',
      content: lines.join('\n'),
      isError: false,
      meta: { toolName: 'list_chats', executionMs: 0, resultCount: sessions.length },
    };
  },
};
