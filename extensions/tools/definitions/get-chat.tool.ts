/**
 * get_chat tool
 *
 * Loads a full chat session by ID and returns a summary of its conversation.
 */

import type { ToolDefinition, ToolResult } from '../types';
import { chatService } from '@/services/chat.service';

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
        content: `Failed to load chat: ${error instanceof Error ? error.message : String(error)}`,
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

    const lines: string[] = [
      `Chat: "${session.title}"`,
      `Date: ${date}`,
      `Messages: ${session.messages.length}`,
      '',
      '--- Conversation ---',
    ];

    for (const msg of session.messages) {
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
