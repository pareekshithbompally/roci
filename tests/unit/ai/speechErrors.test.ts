/** Speech failures read as one plain sentence through the one AI error translator, like every other AI job. */

import { describe, it, expect, vi } from 'vitest';
import { APICallError, UnsupportedFunctionalityError } from 'ai';

const engine = vi.hoisted(() => ({ open: vi.fn(), feed: vi.fn() }));
vi.mock('@services/ai/transcription/streaming', () => ({
  STREAMING: { 'on-device': { concurrent: 1, open: engine.open } },
}));

import { toAiError } from '@services/ai/errors';
import { openLiveStream } from '@services/ai/transcription/live';

const local = { provider: 'on-device', model: 'parakeet-tdt' };

describe('speech errors', () => {
  it('a model asked for what it cannot do says which, and where to choose another speech model', () => {
    const error = toAiError(new UnsupportedFunctionalityError({ functionality: 'non-streaming transcription with gpt-live-transcribe' }), 'speech', 'openai');
    expect(error.kind).toBe('setup');
    expect(error.message).toBe("OpenAI doesn't support non-streaming transcription with gpt-live-transcribe. Choose another speech model in Settings › Default Models.");
  });

  it('a speech engine\'s own sentence for its native code stays as it is', () => {
    const own = new Error('Speech Recognition is off for Roci. Allow it in Settings › Integrations.', { cause: { code: 'not-authorized' } });
    expect(toAiError(own, 'speech', 'apple-intelligence').message).toBe('Speech Recognition is off for Roci. Allow it in Settings › Integrations.');
  });

  it('a refused key reads the same for speech as for any AI job', () => {
    const refused = new APICallError({ message: 'no', url: 'x', requestBodyValues: {}, statusCode: 401 });
    expect(toAiError(refused, 'speech', 'openai').kind).toBe('auth');
  });

  it('a stream that fails to open, or later, gives the translated sentence', async () => {
    engine.open.mockRejectedValueOnce(new UnsupportedFunctionalityError({ functionality: 'streaming transcription with whisper-1' }));
    await expect(openLiveStream(local, [])).rejects.toThrow('Choose another speech model in Settings › Default Models.');

    engine.open.mockResolvedValueOnce({ feed: () => Promise.reject(new TypeError('Load failed')), finish: vi.fn(), cancel: vi.fn() });
    const stream = await openLiveStream(local, []);
    await expect(stream.feed(new Float32Array(1))).rejects.toMatchObject({ kind: 'network' });
  });
});
