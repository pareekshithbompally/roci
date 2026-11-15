import { describe, it, expect, vi } from 'vitest';
import type { StreamProgress } from '@services/ai/types';

/** A server-sent event stream carrying `events`, one `data:` line each. */
const sseResponse = (events: unknown[]) =>
  new Response(events.map((event) => `data: ${JSON.stringify(event)}\n`).join(''), { status: 200 });

const fetchMock = vi.fn();
vi.mock('@services/platform-fetch', () => ({ getPlatformFetch: () => fetchMock }));

const { followModelLoad, promptProgressPercent } = await import('@services/ai/llamaServer');

const MODEL = 'nvidia/Nemotron:Q4_K_M';
const loading = (current: string, value: number, stages: string[]) => ({
  model: MODEL,
  data: { status: 'loading', progress: { stages, current, value } },
});

/** Follows `events` and checks they produce exactly `expected`, with no stray report after. */
async function expectReports(events: unknown[], expected: StreamProgress[]): Promise<void> {
  fetchMock.mockResolvedValueOnce(sseResponse(events));
  const reports: StreamProgress[] = [];
  followModelLoad('http://127.0.0.1:9931/v1', MODEL, (progress) => reports.push(progress));
  await vi.waitFor(() => expect(reports).toEqual(expected));
  await new Promise((settle) => setTimeout(settle, 0));
  expect(reports).toEqual(expected);
}

describe('followModelLoad', () => {
  it('gives the main weights all but one share per later part', async () => {
    const stages = ['text_model', 'spec_model'];
    await expectReports(
      [
        loading('text_model', 0.5, stages),
        loading('text_model', 1, stages),
        loading('spec_model', 0.5, stages),
        { model: MODEL, data: { status: 'loaded' } },
      ],
      [
        { stage: 'loading-weights', percent: 45 },
        { stage: 'loading-weights', percent: 90 },
        { stage: 'loading-draft', percent: 95 },
      ],
    );
  });

  it('fills the whole bar with the weights when they are the only part', async () => {
    await expectReports([loading('text_model', 0.5, ['text_model'])], [{ stage: 'loading-weights', percent: 50 }]);
  });

  it('ignores other models and stops once the model is loaded', async () => {
    await expectReports(
      [
        { ...loading('text_model', 0.2, ['text_model']), model: 'other' },
        loading('text_model', 0.5, ['text_model']),
        { model: MODEL, data: { status: 'loaded' } },
        loading('text_model', 0.7, ['text_model']),
      ],
      [{ stage: 'loading-weights', percent: 50 }],
    );
  });
});

describe('promptProgressPercent', () => {
  it('counts only the tokens that are not already cached', () => {
    expect(promptProgressPercent({ prompt_progress: { total: 300, cache: 100, processed: 200 } })).toBe(50);
  });

  it('is null for chunks that carry no progress', () => {
    expect(promptProgressPercent({ choices: [] })).toBeNull();
  });
});

describe('isLlamaServer', () => {
  it('asks again after a server that did not answer', async () => {
    const { isLlamaServer } = await import('@services/ai/llamaServer');
    fetchMock.mockRejectedValueOnce(new Error('connection refused'));
    expect(await isLlamaServer('http://127.0.0.1:9932/v1')).toBe(false);
    fetchMock.mockResolvedValueOnce(Response.json({ build_info: 'b1' }));
    await vi.waitFor(async () => expect(await isLlamaServer('http://127.0.0.1:9932/v1')).toBe(true));
  });
});
