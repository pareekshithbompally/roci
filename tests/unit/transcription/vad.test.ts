import { describe, it, expect, vi, afterEach } from 'vitest';
import { getSpeechSegments } from '@services/ai/transcription/vad';

type Handler = (msg: { type: string; id: number }) => void;

/** Fake Worker: records posts, answers via a programmable handler. */
class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  static onPost: Handler | null = null;
  static transfers: Transferable[][] = [];

  constructor() {
    (FakeWorker as unknown as { instance: FakeWorker }).instance = this;
  }

  postMessage(msg: { type: string; id: number }, transfer: Transferable[]) {
    FakeWorker.transfers.push(transfer);
    FakeWorker.onPost?.(msg);
  }

  reply(payload: unknown) {
    this.onmessage?.({ data: payload } as MessageEvent);
  }
}

function respondWith(segments: Array<{ startMs: number; endMs: number }>) {
  FakeWorker.onPost = (msg) => {
    const worker = (FakeWorker as unknown as { instance: FakeWorker }).instance;
    worker.reply({ type: 'segments', id: msg.id, segments });
  };
}

vi.stubGlobal('Worker', FakeWorker);
afterEach(() => {
  FakeWorker.onPost = null;
  FakeWorker.transfers = [];
  vi.useRealTimers();
});

describe('getSpeechSegments', () => {
  it('maps millisecond spans to samples and transfers the buffer', async () => {
    respondWith([{ startMs: 1000, endMs: 2000 }]);
    const samples = new Float32Array(48_000);
    const buffer = samples.buffer;
    const ranges = await getSpeechSegments(samples, 16_000);
    expect(ranges).toEqual([{ startSample: 16_000, endSample: 32_000 }]);
    expect(FakeWorker.transfers).toEqual([[buffer]]);
  });

  it('rejects when the worker never answers', async () => {
    vi.useFakeTimers();
    FakeWorker.onPost = null; // silence: no reply
    const pending = getSpeechSegments(new Float32Array(16_000), 16_000);
    const assertion = expect(pending).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(300_000 + 1);
    await assertion;
  });
});
