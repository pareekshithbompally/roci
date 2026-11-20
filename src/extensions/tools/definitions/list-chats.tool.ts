/** list_chats: the user's chats with Roci, most recent first, read from roci.db. */

import { z } from 'zod';
import { defineTool, fail, limit, ok, toolDate } from '@extensions/tools/contract';
import { store } from '@services/db';
import { errorMessage } from '@shared/utils/errors';

export const listChatsTool = defineTool({
  name: 'list_chats',
  description:
    "List the user's earlier chats with you, most recent first, each with its ID. Use it to browse recent chats, then " +
    'read one with get_chat; to find a chat by topic, use search_chats.',
  input: z.object({ limit: limit(10, 50) }),

  async execute({ limit: count }) {
    let chats;
    try {
      chats = (await store.items.page(null, count, { kind: 'chat' })).flatMap((item) => (item.kind === 'chat' ? [item.chat] : []));
    } catch (error: unknown) {
      return fail(`Failed to list chats: ${errorMessage(error)}`);
    }
    if (chats.length === 0) return ok('No chats yet.', { resultCount: 0 });

    const lines = chats.map((c, i) => `${i + 1}. "${c.title}" — ${toolDate(c.lastMessageAt)} — ID: ${c.id}`);
    return ok([`${chats.length} recent chat(s):`, '', ...lines].join('\n'), { resultCount: chats.length });
  },
});
