/** list_chats: the user's chats with Roci, most recent first, read from roci.db. */

import { z } from 'zod';
import { defineTool, fail, limit, ok, toolDate } from '@extensions/tools/contract';
import { chatService } from '@services/chat.service';
import { errorMessage } from '@shared/utils/errors';

export const listChatsTool = defineTool({
  name: 'list_chats',
  description:
    "List the user's earlier chats with you, most recent first, with each chat's ID. Use it when the user asks what " +
    'they talked about recently; to find a chat by topic, use search_chats.',
  input: z.object({ limit: limit(10, 50) }),

  async execute({ limit: count }) {
    let chats;
    try {
      chats = (await chatService.listSessions()).slice(0, count);
    } catch (error: unknown) {
      return fail(`Failed to list chats: ${errorMessage(error)}`);
    }
    if (chats.length === 0) return ok('No chats yet.', { resultCount: 0 });

    const lines = chats.map((c, i) => `${i + 1}. "${c.title}" — ${toolDate(c.lastMessageAt)} — ID: ${c.id}`);
    return ok([`${chats.length} recent chat(s):`, '', ...lines].join('\n'), { resultCount: chats.length });
  },
});
