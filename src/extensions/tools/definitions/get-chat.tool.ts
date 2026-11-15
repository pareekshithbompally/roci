/** get_chat: loads a chat session by ID and summarises its conversation. */

import type { ToolDefinition, ToolResult } from '@extensions/tools/types';
import { chatService } from '@services/chat.service';
import { MAX_CHAT_MESSAGES_FOR_LLM } from '@extensions/tools/constants';
import { errorMessage } from '@shared/utils/errors';

export const getChatTool: ToolDefinition = {
  name: 'get_chat',
  description:
    'Load the full content of a specific chat session by its ID. ' +
    'Returns the conversation history as a readable summary. ' +
    'Use after search_chats when you need the full conversation context.',
  parameters: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: 'The chat session ID from search_chats results.',
      },
    },
    required: ['session_id'],
  },

  async execute(params): Promise<ToolResult> {
    const sessionId = params.session_id as string;

    let session;
    try {
      session = await chatService.loadSession(sessionId);
    } catch (error) {
      return {
        toolCallId: '',
        content: `Failed to load chat: ${errorMessage(error)}`,
        isError: true,
        meta: { toolName: 'get_chat', executionMs: 0 },
      };
    }

    if (!session) {
      return {
        toolCallId: '',
        content: `Chat session not found: ${sessionId}`,
        isError: false,
        meta: { toolName: 'get_chat', executionMs: 0 },
      };
    }

    const date = new Date(session.lastMessageAt).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    // Prioritize recent messages to stay within LLM context budget
    const messages = session.messages.length > MAX_CHAT_MESSAGES_FOR_LLM
      ? session.messages.slice(-MAX_CHAT_MESSAGES_FOR_LLM)
      : session.messages;

    const truncatedNotice = session.messages.length > MAX_CHAT_MESSAGES_FOR_LLM
      ? `(showing last ${MAX_CHAT_MESSAGES_FOR_LLM} of ${session.messages.length} messages)\n`
      : '';

    const lines: string[] = [
      `Chat: "${session.title}"`,
      `Date: ${date}`,
      `Messages: ${session.messages.length}`,
      truncatedNotice,
      '--- Conversation ---',
    ];

    for (const msg of messages) {
      if (!msg.text?.trim()) continue;
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      const text = msg.text.length > 800
        ? msg.text.slice(0, 800) + '...[truncated]'
        : msg.text;
      lines.push(`${role}: ${text}`, '');
    }

    return {
      toolCallId: '',
      content: lines.join('\n'),
      isError: false,
      meta: { toolName: 'get_chat', executionMs: 0 },
    };
  },
};
