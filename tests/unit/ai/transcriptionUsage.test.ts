import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppSettings } from '@shared/types';

const runTranscription = vi.hoisted(() => vi.fn());
const recordUsage = vi.hoisted(() => vi.fn());

vi.mock('@services/ai/transcription', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@services/ai/transcription')>()),
  runTranscription,
}));
vi.mock('@extensions/usage', () => ({ recordUsage }));
// The model catalogue loads from models.dev when not cached: no network in unit tests.
vi.mock('@services/modalities', async (importOriginal) => {
  const real = await importOriginal<typeof import('@services/modalities')>();
  real.modalitiesService.ensureLoaded = async () => undefined;
  return real;
});

import { transcribeAudio } from '@services/unifiedAIService';

const settings = {
  transcriptionProvider: 'hex',
  transcriptionModel: 'parakeet_unified_en',
  hexIntegration: { enabled: true },
} as AppSettings;

/** Over the 1 s minimum: header + 2 s of 16 kHz 16-bit PCM. */
const audioBlob = () => new Blob([new Uint8Array(44 + 16_000 * 2 * 2)], { type: 'audio/wav' });

beforeEach(() => vi.clearAllMocks());

describe('transcribeAudio usage', () => {
  it('logs a transcription row against the speech model when the engine reports tokens', async () => {
    const usage = { inputTokens: 900, outputTokens: 50 };
    runTranscription.mockImplementation(async (_a, _s, _p, { onBilled }) => {
      onBilled({ usage, audioSeconds: 0 });
      return { text: 'hello', segments: [] };
    });
    await transcribeAudio(audioBlob(), settings, [], { sessionId: 'mtg-1' });
    expect(recordUsage).toHaveBeenCalledWith('transcription', { provider: 'hex', modelId: 'parakeet_unified_en' }, usage, 'mtg-1', 0);
  });

  it('logs the audio it sent for engines billed by the minute', async () => {
    runTranscription.mockImplementation(async (_a, _s, _p, { onBilled }) => {
      onBilled({ audioSeconds: 2 });
      return { text: 'hello', segments: [] };
    });
    await transcribeAudio(audioBlob(), settings, [], { sessionId: 'mtg-1' });
    expect(recordUsage).toHaveBeenCalledWith('transcription', { provider: 'hex', modelId: 'parakeet_unified_en' }, undefined, 'mtg-1', 2);
  });

  it('logs nothing when nothing was sent (silence skipped) and no tokens were spent', async () => {
    runTranscription.mockResolvedValue({ text: 'hello', segments: [] });
    await transcribeAudio(audioBlob(), settings, []);
    expect(recordUsage).not.toHaveBeenCalled();
  });
});
