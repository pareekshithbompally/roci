import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppSettings } from '@shared/types';

const { runTranscriptionMock } = vi.hoisted(() => ({ runTranscriptionMock: vi.fn() }));

vi.mock('@services/ai/transcription', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@services/ai/transcription')>()),
  runTranscription: runTranscriptionMock,
}));
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
function audioBlob(): Blob {
  const bytes = new Uint8Array(44 + 16_000 * 2 * 2);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // 'RIFF', enough to pass the size gate
  return new Blob([bytes], { type: 'audio/wav' });
}

beforeEach(() => runTranscriptionMock.mockReset());

describe('transcribeAudio empty guard', () => {
  it('throws a no-speech error instead of returning blank text to summarize', async () => {
    runTranscriptionMock.mockResolvedValue({ text: '  \n\n  ', segments: [] });
    await expect(transcribeAudio(audioBlob(), settings, [])).rejects.toThrow(/no speech/i);
  });

  it('returns the transcription when speech is present', async () => {
    runTranscriptionMock.mockResolvedValue({ text: 'hello', segments: [] });
    const result = await transcribeAudio(audioBlob(), settings, []);
    expect(result.text).toBe('hello');
  });
});

describe('transcribeAudio integration gate', () => {
  it('refuses a Hex model while the Hex integration is off, without reaching Hex', async () => {
    const off = { ...settings, hexIntegration: { enabled: false } } as AppSettings;
    await expect(transcribeAudio(audioBlob(), off, [])).rejects.toThrow(/Hex is off/);
    expect(runTranscriptionMock).not.toHaveBeenCalled();
  });
});
