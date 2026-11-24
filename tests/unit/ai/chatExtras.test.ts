import { describe, expect, it } from 'vitest';
import { finishReplyDescription, FINISH_REPLY_RULE, buildChatSystemPrompt, NO_TOOLS } from '@core/ai/prompts';
import { chatExtrasSchema } from '@core/ai/schemas';
import { finishReplyTools } from '@extensions/tool-orchestrator/finishReply';

const both = { title: true, suggestions: true };

describe('finishReply', () => {
  it('is sent only while a title or follow-ups are wanted', () => {
    expect(Object.keys(finishReplyTools(both))).toEqual(['finishReply']);
    expect(finishReplyTools({ title: false, suggestions: false })).toEqual({});
  });

  it('describes only the fields asked for', () => {
    expect(finishReplyDescription({ title: true, suggestions: false })).toContain('2 to 6 words naming its specific subject');
    expect(finishReplyDescription({ title: true, suggestions: false })).not.toContain('"suggestions"');
    expect(finishReplyDescription({ title: false, suggestions: true })).not.toContain('"title"');
  });

  it('the chat instructions say to call it last only while it is sent', () => {
    const prompt = (finishReply: boolean) =>
      buildChatSystemPrompt({ tools: NO_TOOLS, modalities: { input: ['text'], output: ['text'] }, meetingCount: 0, timeContext: '', finishReply });
    expect(prompt(true)).toContain(FINISH_REPLY_RULE);
    expect(prompt(false)).not.toContain(FINISH_REPLY_RULE);
  });

  it('its input holds exactly the fields asked for', () => {
    expect(Object.keys(chatExtrasSchema(both).shape)).toEqual(['title', 'suggestions']);
    expect(Object.keys(chatExtrasSchema({ title: true, suggestions: false }).shape)).toEqual(['title']);
    expect(Object.keys(chatExtrasSchema({ title: false, suggestions: true }).shape)).toEqual(['suggestions']);
  });
});
