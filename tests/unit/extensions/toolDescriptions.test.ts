import { describe, it, expect } from 'vitest';
import { toolRegistry } from '@extensions/tools';
import { CONFIRMED_ON_A_CARD } from '@extensions/tools/contract';

const description = (name: string) => toolRegistry.getTools().find((t) => t.name === name)?.description ?? '';

describe('tool descriptions work together', () => {
  it('every to-do change is confirmed the same way, scoped to chat (MCP agents read these too)', () => {
    expect(description('suggest_todo')).toContain(CONFIRMED_ON_A_CARD);
    expect(CONFIRMED_ON_A_CARD).toContain("In Roci's chat");
  });

  it('find, then read only when the find did not answer', () => {
    expect(description('find')).toContain('read one only when the snippets do not answer');
    expect(description('read')).toContain('by the id find returned');
  });

  it("find is for the user's own things; to-dos cover reminders, facts go to memory", () => {
    expect(description('find')).toContain('not for general knowledge');
    expect(description('suggest_todo')).toContain('a fact to remember goes to suggest_memory');
  });
});
