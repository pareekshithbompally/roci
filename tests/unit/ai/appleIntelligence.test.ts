import { describe, it, expect, vi, beforeEach } from 'vitest';

const generate = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke, Channel: class {} }));
vi.mock('@services/ai/apple/appleIntelligence.service', async (importOriginal) => ({
  ...(await importOriginal<typeof AppleService>()),
  appleIntelligence: { generate },
}));

import { appleIntelligenceModel } from '@services/ai/apple/appleLanguageModel';
import type * as AppleService from '@services/ai/apple/appleIntelligence.service';
import { isContextWindowError, summaryError } from '@services/ai/apple/contextWindow';
import { excerptTranscript, transcriptBudget, GAP_MARKER } from '@services/ai/transcription/excerpt';

beforeEach(() => {
  generate.mockReset();
  invoke.mockReset();
});

describe('appleIntelligenceModel (AI SDK v4)', () => {
  it('passes system text as instructions, user text as the prompt, and the JSON schema for guided output', async () => {
    generate.mockResolvedValue('{"title":"T"}');
    const schema = { type: 'object', properties: { title: { type: 'string' } } };
    const result = await appleIntelligenceModel().doGenerate({
      prompt: [
        { role: 'system', content: 'Summarize meetings.' },
        { role: 'user', content: [{ type: 'text', text: 'Transcript:\nHello' }] },
      ],
      responseFormat: { type: 'json', schema: schema as never },
    });
    expect(generate).toHaveBeenCalledWith('Summarize meetings.', 'Transcript:\nHello', schema, undefined);
    expect(result.content).toEqual([{ type: 'text', text: '{"title":"T"}' }]);
    expect(result.finishReason.unified).toBe('stop');
  });

  it('plain text when no schema is asked for', async () => {
    generate.mockResolvedValue('ok');
    await appleIntelligenceModel().doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] });
    expect(generate).toHaveBeenCalledWith('', 'hi', undefined, undefined);
  });

  it('passes the call\'s abort signal on, and an abort reason through unwrapped', async () => {
    const controller = new AbortController();
    controller.abort();
    generate.mockRejectedValue(controller.signal.reason);
    const call = appleIntelligenceModel().doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      abortSignal: controller.signal,
    });
    await expect(call).rejects.toBe(controller.signal.reason);
    expect(generate).toHaveBeenCalledWith('', 'hi', undefined, controller.signal);
  });

  it('recognizes a context-window failure, also when the AI SDK wraps it', () => {
    const native = { code: 'context-window' };
    expect(isContextWindowError(native)).toBe(true);
    expect(isContextWindowError(new Error('wrapped', { cause: native }))).toBe(true);
    expect(isContextWindowError({ code: 'refused' })).toBe(false);
  });

  it('turns an Apple refusal into a sentence with the next step; other errors pass through', () => {
    expect((summaryError(new Error('x', { cause: { code: 'refused' } })) as Error).message).toMatch(/declined this transcript.*Settings › Default Models/);
    const other = new Error('No API key');
    expect(summaryError(other)).toBe(other);
  });
});

describe('appleIntelligence.generate cancel', () => {
  const service = () => vi.importActual<typeof AppleService>('@services/ai/apple/appleIntelligence.service');

  it('abort rejects at once with the reason and cancels the same generation natively', async () => {
    invoke.mockImplementation((command: string) => (command.endsWith('|generate') ? new Promise(() => {}) : Promise.resolve()));
    const { appleIntelligence } = await service();
    const controller = new AbortController();
    const call = appleIntelligence.generate('i', 'p', undefined, controller.signal);
    controller.abort();
    await expect(call).rejects.toBe(controller.signal.reason);
    const [, args] = invoke.mock.calls.find(([command]) => command.endsWith('|generate'))!;
    expect(invoke).toHaveBeenCalledWith('plugin:apple-intelligence|generate_cancel', { id: args.id });
  });

  it('an already-aborted signal never starts generation', async () => {
    const { appleIntelligence } = await service();
    const controller = new AbortController();
    controller.abort();
    await expect(appleIntelligence.generate('i', 'p', undefined, controller.signal)).rejects.toBe(controller.signal.reason);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('resolves with the text when not aborted, and a later abort cancels nothing', async () => {
    invoke.mockResolvedValue('done');
    const { appleIntelligence } = await service();
    const controller = new AbortController();
    await expect(appleIntelligence.generate('i', 'p', { type: 'object' }, controller.signal)).resolves.toBe('done');
    controller.abort();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][1]).toMatchObject({ instructions: 'i', prompt: 'p', schema: '{"type":"object"}' });
  });
});

describe('transcript excerpt (context budget)', () => {
  it('no window → no trimming', () => {
    expect(transcriptBudget(null, 'x')).toBeNull();
    expect(excerptTranscript('abc', null)).toBe('abc');
  });

  it('budget leaves room for the answer and the instructions', () => {
    expect(transcriptBudget(4096, 'x'.repeat(1000))).toBe((4096 - 1000) * 3 - 1000);
  });

  it('long transcript → opening + […] + end, cut on line breaks, within budget', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i} of the meeting`).join('\n');
    const out = excerptTranscript(lines, 800);
    expect(out.length).toBeLessThanOrEqual(800);
    expect(out.startsWith('line 0 of the meeting')).toBe(true);
    expect(out.endsWith('line 199 of the meeting')).toBe(true);
    expect(out).toContain(GAP_MARKER);
  });
});
