import { describe, expect, it, vi, beforeEach } from 'vitest';

const generateStructured = vi.hoisted(() => vi.fn());
vi.mock('@services/ai/structured', () => ({ generateStructured }));

import { chatExtrasInstructions, buildChatSystemPrompt, NO_TOOLS } from '@core/ai/prompts';
import { chatExtrasSchema } from '@core/ai/schemas';
import { askChatExtras } from '@extensions/tool-orchestrator/chatExtras';

const both = { title: true, suggestions: true };
const model = { provider: 'openai', modelId: 'gpt' } as never;
const ask = (want = both) => askChatExtras({ model, want, question: 'Plan the Q3 launch?', answer: 'Here is the plan.', sessionId: 'c1' });

beforeEach(() => {
  generateStructured.mockReset();
});

describe('chat extras', () => {
  it('asks only for the fields wanted', () => {
    expect(chatExtrasInstructions({ title: true, suggestions: false })).toContain('2 to 6 words naming its specific subject');
    expect(chatExtrasInstructions({ title: true, suggestions: false })).not.toContain('"suggestions"');
    expect(chatExtrasInstructions({ title: false, suggestions: true })).not.toContain('"title"');
  });

  it('never tells the reply to call a tool for them', () => {
    const prompt = buildChatSystemPrompt({ tools: NO_TOOLS, modalities: { input: ['text'], output: ['text'] }, meetingCount: 0, timeContext: '' });
    expect(prompt).not.toMatch(/finishReply/);
  });

  it('its output holds exactly the fields asked for', () => {
    expect(Object.keys(chatExtrasSchema(both).shape)).toEqual(['title', 'suggestions']);
    expect(Object.keys(chatExtrasSchema({ title: true, suggestions: false }).shape)).toEqual(['title']);
    expect(Object.keys(chatExtrasSchema({ title: false, suggestions: true }).shape)).toEqual(['suggestions']);
  });

  it('asks the chat\'s model once, from the question and the answer only, and tidies what comes back', async () => {
    generateStructured.mockResolvedValue({ title: 'Q3 launch plan.', suggestions: ['Who owns it?', 'What is at risk?', 'Draft the email', 'One too many'] });
    expect(await ask()).toEqual({ title: 'Q3 launch plan', suggestions: ['Who owns it?', 'What is at risk?', 'Draft the email'] });
    expect(generateStructured).toHaveBeenCalledOnce();
    const [call] = generateStructured.mock.calls[0] as [{ model: unknown; prompt: string; usage: object; schema: { shape: object } }];
    expect(call.model).toBe(model);
    expect(call.prompt).toContain('Plan the Q3 launch?');
    expect(call.prompt).toContain('Here is the plan.');
    expect(call.usage).toEqual({ category: 'chat', sessionId: 'c1' });
    expect(Object.keys(call.schema.shape)).toEqual(['title', 'suggestions']);
  });

  it('gives none when the call fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    generateStructured.mockRejectedValue(new Error('rate limited'));
    expect(await ask()).toEqual({ suggestions: [] });
  });

  it('passes the reply\'s signal on, and a stopped call gives none without an error in the log', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    error.mockClear();
    const controller = new AbortController();
    controller.abort();
    generateStructured.mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    expect(await askChatExtras({ model, want: both, question: 'q', answer: 'a', sessionId: 'c1', signal: controller.signal })).toEqual({ suggestions: [] });
    expect(generateStructured.mock.calls[0][0]).toMatchObject({ signal: controller.signal });
    expect(error).not.toHaveBeenCalled();
  });

  it('makes no call when nothing is wanted', async () => {
    expect(await ask({ title: false, suggestions: false })).toEqual({ suggestions: [] });
    expect(generateStructured).not.toHaveBeenCalled();
  });
});
