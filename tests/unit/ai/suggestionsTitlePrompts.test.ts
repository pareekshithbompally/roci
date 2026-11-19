import { describe, it, expect } from 'vitest';
import { CHAT_TITLE_PROMPT, NO_TOOLS, suggestionsPrompt, toolNamesOf } from '@core/ai/prompts';

describe('suggestionsPrompt', () => {
  it('says what Roci can do here with the same tool names as the chat prompt', () => {
    const tools = { ...NO_TOOLS, webSearch: true, apps: ['Linear'] };
    expect(suggestionsPrompt(tools)).toContain(`Roci can answer from what it knows and use: ${toolNamesOf(tools).join('; ')}.`);
  });

  it('without tools, follow-ups can only ask for answers from what Roci knows', () => {
    expect(suggestionsPrompt(NO_TOOLS)).toContain("Roci can only answer from what it knows here; it can't look anything up.");
  });

  it('keeps follow-ups on topic, doable here, and answers when the reply asked something', () => {
    const text = suggestionsPrompt(NO_TOOLS);
    expect(text).toContain('mention meetings only when it is about meetings');
    expect(text).toContain('Never an action in the outside world');
    expect(text).toContain('If the reply asked the user a question, suggest short answers to it.');
    expect(text).not.toContain('action items');
  });
});

describe('CHAT_TITLE_PROMPT', () => {
  it('names the specific subject, not the kind of request, without filler', () => {
    expect(CHAT_TITLE_PROMPT).toContain('2 to 6 words naming its specific subject');
    expect(CHAT_TITLE_PROMPT).toContain('No filler words');
  });
});
