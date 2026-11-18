import { describe, it, expect } from 'vitest';
import { buildChatSystemPrompt, NO_TOOLS } from '@core/ai/prompts';
import type { ChatToolset } from '@core/ai/prompts';

const base = { meetingCount: 2, temporalContext: 'Current date: 2026-11-18 (Wednesday).' };
const prompt = (tools: Partial<ChatToolset> = {}, extra: { attachedMeetings?: string; meetingCount?: number } = {}) =>
  buildChatSystemPrompt({ ...base, ...extra, tools: { ...NO_TOOLS, ...tools } });

describe('buildChatSystemPrompt', () => {
  it('always has the identity, answer style, sources and date', () => {
    const text = prompt();
    expect(text).toContain('You are Roci');
    expect(text).toContain('## How to answer');
    expect(text).toContain('## Sources');
    expect(text).toContain(base.temporalContext);
  });

  it('guides only the tool groups the request carries', () => {
    expect(prompt()).not.toMatch(/## (Meetings, to-dos|Web search|Images|Connected tools)/);
    const all = prompt({ meetings: true, webSearch: true, image: true, mcp: true });
    for (const heading of ['## Meetings, to-dos and past chats', '## Web search', '## Images', '## Connected tools']) {
      expect(all).toContain(heading);
    }
    expect(prompt({ webSearch: true })).not.toContain('## Images');
  });

  it('guides meeting tools even with no recorded meetings', () => {
    const text = prompt({ meetings: true }, { meetingCount: 0 });
    expect(text).toContain('no recorded meetings yet');
    expect(text).toContain('## Meetings, to-dos and past chats');
  });

  it('adds attached meetings only when there are some', () => {
    expect(prompt()).not.toContain('## Meetings the user attached');
    expect(prompt({}, { attachedMeetings: 'Weekly sync: ship Friday' })).toContain('## Meetings the user attached\n\nAnswer from these first');
  });
});
