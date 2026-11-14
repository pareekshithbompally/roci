import { describe, it, expect, vi, beforeEach } from 'vitest';

const generate = vi.hoisted(() => vi.fn());
vi.mock('@services/ai/apple/appleIntelligence.service', () => ({
  appleIntelligence: { generate },
  isAppleError: (e: unknown) => typeof e === 'object' && e !== null && 'code' in e,
}));

import { appleIntelligenceModel } from '@services/ai/apple/appleLanguageModel';
import { isContextWindowError, summaryError } from '@services/ai/apple/contextWindow';
import { excerptTranscript, transcriptBudget, GAP_MARKER } from '@services/ai/transcription/excerpt';

beforeEach(() => generate.mockReset());

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
    expect(generate).toHaveBeenCalledWith('Summarize meetings.', 'Transcript:\nHello', schema);
    expect(result.content).toEqual([{ type: 'text', text: '{"title":"T"}' }]);
    expect(result.finishReason.unified).toBe('stop');
  });

  it('plain text when no schema is asked for', async () => {
    generate.mockResolvedValue('ok');
    await appleIntelligenceModel().doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] });
    expect(generate).toHaveBeenCalledWith('', 'hi', undefined);
  });

  it('recognizes a context-window failure, also when the AI SDK wraps it', () => {
    const native = { code: 'context-window' };
    expect(isContextWindowError(native)).toBe(true);
    expect(isContextWindowError(new Error('wrapped', { cause: native }))).toBe(true);
    expect(isContextWindowError({ code: 'refused' })).toBe(false);
  });

  it('turns an Apple refusal into a sentence with the next step; other errors pass through', () => {
    expect((summaryError(new Error('x', { cause: { code: 'refused' } })) as Error).message).toMatch(/declined this transcript.*Settings › Audio/);
    const other = new Error('No API key');
    expect(summaryError(other)).toBe(other);
  });
});

describe('transcript excerpt (HEX budget)', () => {
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
