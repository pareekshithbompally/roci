import { describe, expect, it } from 'vitest';
import { generateText, jsonSchema, Output, wrapLanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { schemaInPromptMiddleware } from '@services/ai/schemaInPrompt';
import { serverAppOf } from '@shared/utils/provider.utils';

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };

/** A model that ignores the schema and replies `text`, wrapped as a schema-ignoring provider is. */
function ignoringSchema(text: string) {
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({ content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] }) as never,
  });
  return { model, wrapped: wrapLanguageModel({ model, middleware: schemaInPromptMiddleware }) };
}

const schema = jsonSchema<{ title: string }>({ type: 'object', properties: { title: { type: 'string' } }, required: ['title'] });

describe('schemaInPromptMiddleware', () => {
  it('a call for JSON carries the schema in its instructions and has its JSON read out of code fences', async () => {
    const { model, wrapped } = ignoringSchema('```json\n{"title":"Panic of 1907"}\n```');
    const { output } = await generateText({ model: wrapped, instructions: 'Name it.', prompt: 'p', output: Output.object({ schema }) });
    expect(output).toEqual({ title: 'Panic of 1907' });
    const [system, schemaTurn] = model.doGenerateCalls[0].prompt;
    expect(system).toEqual({ role: 'system', content: 'Name it.' });
    expect(schemaTurn).toMatchObject({ role: 'system', content: expect.stringContaining('matching this JSON schema') });
  });

  it('any other call passes through untouched: no added instructions, its code fences kept', async () => {
    const { model, wrapped } = ignoringSchema('```ts\nconst a = 1;\n```');
    const { text } = await generateText({ model: wrapped, prompt: 'p' });
    expect(text).toBe('```ts\nconst a = 1;\n```');
    expect(model.doGenerateCalls[0].prompt).toHaveLength(1);
  });

  it('Ollama is the server app that ignores a schema; the others hold replies to it', () => {
    expect(serverAppOf('local:ollama')?.ignoresSchema).toBe(true);
    expect(serverAppOf('local:lmstudio')?.ignoresSchema).toBeUndefined();
  });
});
