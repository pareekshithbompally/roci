import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResolvedModel } from '@shared/utils/modelResolver';

const generateText = vi.hoisted(() => vi.fn());
const recordUsage = vi.hoisted(() => vi.fn());
const status = vi.hoisted(() => vi.fn());
const modalities = vi.hoisted(() => ({
  ensureLoaded: vi.fn(),
  catalogReport: vi.fn(),
}));

const catalogWindow = (contextTokens: number) => modalities.catalogReport.mockReturnValue({ report: { contextTokens }, exact: true });

vi.mock('ai', async (importOriginal) => ({ ...(await importOriginal<typeof import('ai')>()), generateText }));
vi.mock('@services/ai/provider', () => ({ createModel: () => ({}) }));
vi.mock('@extensions/usage', () => ({ recordUsage }));
vi.mock('@services/modalities', () => ({ modalitiesService: modalities }));
vi.mock('@services/ai/apple/appleIntelligence.service', () => ({
  appleIntelligence: { status },
  isAppleError: () => false,
}));

import { contextTokensFor } from '@services/ai/transcription/excerpt';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import { analyzeTranscript } from '@services/ai/transcription/analyze';

const resolvedFor = (provider: string): ResolvedModel => ({
  provider,
  modelId: 'm1',
  apiKey: 'k',
  baseUrl: '',
  model: { id: 'm1' } as ResolvedModel['model'],
  providerConfig: {} as ResolvedModel['providerConfig'],
});

const analysis = { title: 'T', summary: { overview: 'o', keyDiscussionPoints: [], decisionsMade: [], actionItems: [], nextSteps: [] }, categories: [], knowledge: { entities: [], relations: [] } };

beforeEach(() => {
  vi.clearAllMocks();
  modalities.ensureLoaded.mockResolvedValue(undefined);
  modalities.catalogReport.mockReturnValue(null);
});

describe('contextTokensFor', () => {
  it("uses Apple Intelligence's reported window", async () => {
    status.mockResolvedValue({ availability: 'available', contextTokens: 4096 });
    await expect(contextTokensFor(resolvedFor('apple-intelligence'))).resolves.toBe(4096);
    expect(modalities.ensureLoaded).not.toHaveBeenCalled();
  });

  it('uses the model catalog window for any other model, after loading the catalog', async () => {
    catalogWindow(128_000);
    await expect(contextTokensFor(resolvedFor('openai'))).resolves.toBe(128_000);
    expect(modalities.ensureLoaded).toHaveBeenCalled();
    expect(modalities.catalogReport).toHaveBeenCalledWith('openai', 'm1');
  });

  it("uses a downloaded model's tuned context: what its engine loads, not the model's maximum", async () => {
    catalogWindow(128_000);
    await expect(contextTokensFor(resolvedFor('on-device'))).resolves.toBe(LOCAL_MODELS_CONFIG.rociDefaults['ctx-size']);
  });

  it('returns null when the window is unknown', async () => {
    await expect(contextTokensFor(resolvedFor('openai'))).resolves.toBeNull();
  });
});

describe('analyzeTranscript', () => {
  it('trims a transcript longer than a known window', async () => {
    catalogWindow(2_000);
    generateText.mockResolvedValue({ output: analysis, usage: { inputTokens: 1, outputTokens: 1 } });
    const transcript = 'line\n'.repeat(5_000);
    await analyzeTranscript({ transcript, categories: [], resolved: resolvedFor('openai') });
    expect(generateText.mock.calls[0][0].prompt.length).toBeLessThan(transcript.length);
  });

  it('sends the whole transcript when the window is unknown', async () => {
    generateText.mockResolvedValue({ output: analysis, usage: {} });
    const transcript = 'line\n'.repeat(5_000);
    await analyzeTranscript({ transcript, categories: [], resolved: resolvedFor('openai') });
    expect(generateText.mock.calls[0][0].prompt).toBe(`Transcript:\n${transcript}`);
  });

  it('logs a summary usage row for the meeting', async () => {
    generateText.mockResolvedValue({ output: analysis, usage: { inputTokens: 120, outputTokens: 30 } });
    const resolved = resolvedFor('openai');
    const result = await analyzeTranscript({ transcript: 'hi', categories: [], resolved, meetingId: 'mtg-1' });
    expect(result).toEqual(analysis);
    expect(recordUsage).toHaveBeenCalledWith('summary', resolved, expect.objectContaining({ inputTokens: 120, outputTokens: 30 }), 'mtg-1');
  });

  it('logs nothing when the call fails', async () => {
    generateText.mockRejectedValue(new Error('boom'));
    await expect(analyzeTranscript({ transcript: 'hi', categories: [], resolved: resolvedFor('openai') })).rejects.toThrow('boom');
    expect(recordUsage).not.toHaveBeenCalled();
  });
});
