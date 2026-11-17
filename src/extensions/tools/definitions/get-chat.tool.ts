/** get_chat: one earlier chat's conversation by its ID, most recent messages first to fit. */

import { z } from 'zod';
import { defineTool, fail, idFrom, ok, toolDate } from '@extensions/tools/contract';
import { chatService } from '@services/chat.service';
import { MAX_CHAT_MESSAGES_FOR_LLM } from '@extensions/tools/constants';
import { errorMessage } from '@shared/utils/errors';

export const getChatTool = defineTool({
  name: 'get_chat',
  description:
    'Read one of the user\'s earlier chats by its ID: the conversation, with its latest messages. ' +
    'Get the ID from search_chats or list_chats first.',
  input: z.object({ chat_id: idFrom('search_chats or list_chats') }),

  async execute({ chat_id }) {
    let session;
    try {
      session = await chatService.loadSession(chat_id);
    } catch (error: unknown) {
      return fail(`Failed to load chat: ${errorMessage(error)}`);
    }
    if (!session) return fail(`No chat has the ID "${chat_id}". Get chat IDs from search_chats or list_chats.`);

    const date = toolDate(session.lastMessageAt);

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

    return ok(lines.join('\n'), { resultCount: 1 });
  },
});
