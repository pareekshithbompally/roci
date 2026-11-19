import { describe, it, expect } from 'vitest';
import { toolRegistry } from '@extensions/tools';
import { CONFIRMED_ON_A_CARD } from '@extensions/tools/contract';

const description = (name: string) => toolRegistry.getTools().find((t) => t.name === name)?.description ?? '';

describe('tool descriptions work together', () => {
  it('every to-do change is confirmed the same way, scoped to chat (MCP agents read these too)', () => {
    for (const name of ['create_todo', 'update_todo', 'delete_todo']) expect(description(name)).toContain(CONFIRMED_ON_A_CARD);
    expect(CONFIRMED_ON_A_CARD).toContain("In Roci's chat");
  });

  it('find, then read only when the find did not answer', () => {
    expect(description('search_meetings')).toContain('get_meeting only when the snippets do not answer');
    expect(description('search_chats')).toContain('get_chat only when the excerpts do not answer');
    expect(description('list_meetings')).toContain('read one with get_meeting');
    expect(description('list_chats')).toContain('read one with get_chat');
  });

  it('meeting search is for the user\'s own meetings, and to-dos cover remembering and reminders', () => {
    expect(description('search_meetings')).toContain('not for general knowledge');
    expect(description('create_todo')).toContain('remember or be reminded');
  });
});
