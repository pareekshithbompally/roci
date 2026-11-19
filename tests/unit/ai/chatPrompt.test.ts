import { describe, it, expect } from 'vitest';
import { buildChatSystemPrompt, formatTemporalContext, NO_TOOLS } from '@core/ai/prompts';
import type { ChatModalities, ChatToolset } from '@core/ai/prompts';

const TEXT: ChatModalities = { input: ['text'], output: ['text'] };
const ALL: ChatToolset = { meetings: true, webSearch: true, image: true, apps: ['Linear', 'Notion'] };
const base = { meetingCount: 42, temporalContext: 'Current date: 2026-11-20 (Friday).' };
const prompt = (tools: Partial<ChatToolset> = {}, extra: { meetingCount?: number; modalities?: ChatModalities } = {}) =>
  buildChatSystemPrompt({ ...base, modalities: TEXT, ...extra, tools: { ...NO_TOOLS, ...tools } });

describe('buildChatSystemPrompt', () => {
  it('is one assistant: personal assistant first, who also knows the meetings', () => {
    const text = prompt();
    expect(text).toContain("You are Roci, the user's personal assistant");
    expect(text).toContain('You also help with their meetings (42 recorded so far).');
    expect(prompt({}, { meetingCount: 0 })).toContain("They haven't recorded any meetings yet.");
  });

  it('says what the model reads and produces from its modalities, and names the tools sent', () => {
    const text = prompt(ALL, { modalities: { input: ['text', 'image', 'audio'], output: ['text'] } });
    expect(text).toContain('- You can read: text, images and audio.');
    expect(text).toContain('- You can produce: text and images.');
    expect(text).toContain("- Your tools: the user's meetings, to-dos and past chats; web search; image generation; connected apps: Linear and Notion.");
  });

  it('has the model look facts up with its tools instead of training, and caution when a tool fails', () => {
    const text = prompt(ALL);
    expect(text).toContain("don't rely on what you learned in training");
    expect(text).toContain('Search the web first, even if you think you know.');
    expect(text).toContain("- Anything in a connected app (Linear, Notion): use that app's tools rather than guessing.");
    expect(text).toContain('If a tool fails or finds nothing, answer from what you know, but say so first');
  });

  it('without tools: no lookups, the caution on every fact, no tool guidance', () => {
    const text = prompt();
    expect(text).toContain("- You have no tools here, so you can't look anything up.");
    expect(text).toContain("you can't look these up here, so answer from what you know, but say so first");
    expect(text).toContain('you can only see meetings attached to their question');
    expect(text).not.toContain('## Using tools well');
    expect(text).not.toContain('If a tool fails');
    expect(text).not.toContain('Copy IDs exactly');
    expect(text).not.toContain('what you found');
  });

  it('connected apps without web search: apps for what they cover, facts still come with the caution', () => {
    const text = prompt({ apps: ['Linear'] });
    expect(text).toContain("- Anything in a connected app (Linear): use that app's tools rather than guessing.");
    expect(text).toContain("you can't look these up here");
  });

  it('guides tool use (and not overdoing it) only when tools are sent', () => {
    const text = prompt({ webSearch: true });
    expect(text).toContain('## Using tools well');
    expect(text).toContain('Start with one call.');
    expect(text).not.toContain('To-do changes are proposals');
    expect(text).not.toContain('Generate an image only when asked');
  });

  it('meeting tools bring the meetings step and the to-do rule', () => {
    const text = prompt({ meetings: true });
    expect(text).toContain('search or list to find it, open it, then answer');
    expect(text).toContain('To-do changes are proposals');
  });

  it('always ends with the date, and leaves attached meetings to the questions that carry them', () => {
    const text = prompt(ALL);
    expect(text.endsWith(base.temporalContext)).toBe(true);
    expect(text).not.toContain('## Meetings the user attached');
  });
});

describe('formatTemporalContext', () => {
  it('uses the local date, not UTC (just after midnight is still today)', () => {
    const text = formatTemporalContext(new Date(2026, 10, 20, 0, 21));
    expect(text).toContain('Current date: 2026-11-20 (Friday). Time: 00:21 local.');
  });
});
