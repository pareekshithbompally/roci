import { describe, it, expect, vi, afterEach } from 'vitest';
import { readWavMono } from '@shared/utils/wav.utils';
import { getSpeechSegments } from '@services/ai/transcription/vad';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

afterEach(() => invoke.mockReset());

describe('getSpeechSegments', () => {
  it('sends the samples as a 16 kHz WAV body and answers with the detector spans', async () => {
    const spans = [{ startSample: 16_000, endSample: 32_000 }];
    invoke.mockResolvedValue(spans);
    const samples = new Float32Array(48_000);

    await expect(getSpeechSegments(samples)).resolves.toEqual(spans);

    const [command, body] = invoke.mock.calls[0];
    expect(command).toBe('stt_speech_spans');
    expect(readWavMono(body)).toMatchObject({ sampleRate: 16_000 });
  });

  it('rejects when the detector fails', async () => {
    invoke.mockRejectedValue({ code: 'engine', detail: 'bad model' });
    await expect(getSpeechSegments(new Float32Array(16_000))).rejects.toMatchObject({ code: 'engine' });
  });
});
