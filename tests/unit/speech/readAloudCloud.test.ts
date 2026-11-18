import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => undefined }));
const speechAudio = vi.hoisted(() => vi.fn());
vi.mock('@services/ai/speech', () => ({ speechAudio, cloudVoices: () => ['alloy'] }));

/** An audio element the test ends by hand. */
const players: Array<{ onended: (() => void) | null; pause: ReturnType<typeof vi.fn> }> = [];
class FakeAudio {
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();
  constructor() { players.push(this); }
  play() { return Promise.resolve(); }
}

import { readAloud } from '@services/readAloud.service';

const CLOUD = 'openai::gpt-4o-mini-tts';
const speaker = { engine: CLOUD, voice: undefined, providers: [] };
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  players.length = 0;
  invoke.mockReset().mockImplementation(async (cmd: string) => (cmd === 'tts_chunks' ? ['One.', 'Two.'] : undefined));
  speechAudio.mockReset().mockResolvedValue(new Blob(['x'], { type: 'audio/mpeg' }));
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() });
});

describe('cloud read aloud', () => {
  it('reads the reply chunk by chunk, each heard as it plays', async () => {
    const heard: string[] = [];
    const done = readAloud.speak('One. Two.', speaker, (c) => heard.push(c));
    await vi.waitFor(() => expect(players).toHaveLength(1));
    players[0].onended?.();
    await vi.waitFor(() => expect(players).toHaveLength(2));
    players[1].onended?.();
    await done;
    expect(heard).toEqual(['One.', 'Two.']);
    expect(invoke).toHaveBeenCalledWith('tts_chunks', expect.objectContaining({ text: 'One. Two.' }));
  });

  it('Stop while the speech is still being fetched ends quietly, nothing plays', async () => {
    let release: (b: Blob) => void = () => undefined;
    speechAudio.mockImplementation(({ signal }: { signal: AbortSignal }) => new Promise<Blob>((resolve, reject) => {
      release = resolve;
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const done = readAloud.speak('One.', speaker, () => undefined);
    await vi.waitFor(() => expect(speechAudio).toHaveBeenCalled());
    await readAloud.stop();
    await expect(done).resolves.toBeUndefined();
    release(new Blob());
    await flush();
    expect(players).toHaveLength(0);
  });

  it('a new read stops the one playing: one at a time', async () => {
    void readAloud.speak('One.', speaker, () => undefined);
    await vi.waitFor(() => expect(players).toHaveLength(1));
    void readAloud.speak('Again.', speaker, () => undefined);
    await vi.waitFor(() => expect(players[0].pause).toHaveBeenCalled());
  });

  it('a real failure still reaches the caller', async () => {
    speechAudio.mockRejectedValue(new Error('Configure OpenAI API key in Settings → Providers.'));
    await expect(readAloud.speak('One.', speaker, () => undefined)).rejects.toThrow(/API key/);
  });
});
