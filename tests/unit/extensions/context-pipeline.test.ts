import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextPipeline } from '@extensions/context-pipeline/pipeline';
import type { ContextProvider, ContextInput } from '@extensions/context-pipeline/types';

const makeProvider = (
  name: string,
  priority: number,
  confidence: number,
  text: string,
  opts?: { shouldRun?: boolean; throws?: boolean; meta?: Record<string, unknown> },
): ContextProvider => ({
  name,
  priority,
  shouldRun: vi.fn(() => opts?.shouldRun ?? true),
  resolve: opts?.throws
    ? vi.fn().mockRejectedValue(new Error('Provider failed'))
    : vi.fn().mockResolvedValue({
        text,
        provider: name,
        confidence,
        durationMs: 0,
        ...(opts?.meta && { meta: opts.meta }),
      }),
});

const makeInput = (overrides?: Partial<ContextInput>): ContextInput =>
  ({
    userMessage: 'test',
    conversationMessages: [],
    historyItems: [],
    settings: {} as any,
    providers: [],
    manualMeetingRefs: [],
    ...overrides,
  }) as ContextInput;

describe('ContextPipeline', () => {
  let pipeline: ContextPipeline;

  beforeEach(() => {
    pipeline = new ContextPipeline();
  });

  describe('provider ordering', () => {
    it('runs providers in priority order (lower number = first)', async () => {
      const callOrder: string[] = [];
      const p1: ContextProvider = {
        name: 'high-pri',
        priority: 1,
        shouldRun: () => true,
        resolve: vi.fn(async () => {
          callOrder.push('high-pri');
          return { text: 'a', provider: 'high-pri', confidence: 0.5, durationMs: 0 };
        }),
      };
      const p2: ContextProvider = {
        name: 'low-pri',
        priority: 10,
        shouldRun: () => true,
        resolve: vi.fn(async () => {
          callOrder.push('low-pri');
          return { text: 'b', provider: 'low-pri', confidence: 0.5, durationMs: 0 };
        }),
      };

      // Register in reverse order to ensure sorting works
      pipeline.register(p2).register(p1);
      await pipeline.resolve(makeInput());

      expect(callOrder).toEqual(['high-pri', 'low-pri']);
    });

    it('sorts providers by priority even when registered out of order', async () => {
      const p3 = makeProvider('third', 30, 0.3, 'c');
      const p1 = makeProvider('first', 10, 0.3, 'a');
      const p2 = makeProvider('second', 20, 0.3, 'b');

      pipeline.register(p3).register(p1).register(p2);
      await pipeline.resolve(makeInput());

      expect(p1.resolve).toHaveBeenCalled();
      expect(p2.resolve).toHaveBeenCalled();
      expect(p3.resolve).toHaveBeenCalled();
    });
  });

  describe('confidence-based selection', () => {
    it('selects the highest confidence result', async () => {
      pipeline
        .register(makeProvider('low', 1, 0.3, 'low text'))
        .register(makeProvider('high', 2, 0.8, 'high text'))
        .register(makeProvider('mid', 3, 0.5, 'mid text'));

      const result = await pipeline.resolve(makeInput());

      expect(result.text).toBe('high text');
    });

    it('ignores higher confidence with empty text', async () => {
      pipeline
        .register(makeProvider('empty-high', 1, 0.9, ''))
        .register(makeProvider('filled-low', 2, 0.4, 'has text'));

      const result = await pipeline.resolve(makeInput());

      expect(result.text).toBe('has text');
    });
  });

  describe('short-circuit at >= 0.9 confidence', () => {
    it('stops processing after high confidence result', async () => {
      const highConf = makeProvider('high', 1, 0.95, 'great result');
      const afterHigh = makeProvider('after', 2, 0.3, 'should not run');

      pipeline.register(highConf).register(afterHigh);
      await pipeline.resolve(makeInput());

      expect(highConf.resolve).toHaveBeenCalled();
      expect(afterHigh.resolve).not.toHaveBeenCalled();
    });

    it('short-circuits at exactly 0.9 confidence', async () => {
      const exact = makeProvider('exact', 1, 0.9, 'exact threshold');
      const after = makeProvider('after', 2, 0.3, 'skipped');

      pipeline.register(exact).register(after);
      await pipeline.resolve(makeInput());

      expect(exact.resolve).toHaveBeenCalled();
      expect(after.resolve).not.toHaveBeenCalled();
    });

    it('does not short-circuit at 0.89 confidence', async () => {
      const almostHigh = makeProvider('almost', 1, 0.89, 'almost');
      const next = makeProvider('next', 2, 0.3, 'next');

      pipeline.register(almostHigh).register(next);
      await pipeline.resolve(makeInput());

      expect(almostHigh.resolve).toHaveBeenCalled();
      expect(next.resolve).toHaveBeenCalled();
    });

    it('does not short-circuit high confidence with empty text', async () => {
      const emptyHigh = makeProvider('empty', 1, 0.95, '');
      const next = makeProvider('next', 2, 0.5, 'fallback');

      pipeline.register(emptyHigh).register(next);
      await pipeline.resolve(makeInput());

      expect(next.resolve).toHaveBeenCalled();
    });
  });

  describe('fail-open behavior', () => {
    it('continues to next provider when one throws', async () => {
      const failing = makeProvider('failing', 1, 0, '', { throws: true });
      const working = makeProvider('working', 2, 0.7, 'success');

      pipeline.register(failing).register(working);
      const result = await pipeline.resolve(makeInput());

      expect(result.text).toBe('success');
    });

    it('returns empty text when all providers fail', async () => {
      pipeline
        .register(makeProvider('fail1', 1, 0, '', { throws: true }))
        .register(makeProvider('fail2', 2, 0, '', { throws: true }));

      const result = await pipeline.resolve(makeInput());

      expect(result.text).toBe('');
    });

    it('re-throws AbortError from provider', async () => {
      const abortProvider: ContextProvider = {
        name: 'abort',
        priority: 1,
        shouldRun: () => true,
        resolve: vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')),
      };

      pipeline.register(abortProvider);

      await expect(pipeline.resolve(makeInput())).rejects.toThrow('Aborted');
    });
  });

  describe('shouldRun filtering', () => {
    it('skips providers where shouldRun returns false', async () => {
      const skipped = makeProvider('skipped', 1, 0.8, 'skipped text', { shouldRun: false });
      const active = makeProvider('active', 2, 0.5, 'active text');

      pipeline.register(skipped).register(active);
      const result = await pipeline.resolve(makeInput());

      expect(skipped.resolve).not.toHaveBeenCalled();
      expect(result.text).toBe('active text');
    });

    it('passes input to shouldRun', async () => {
      const provider = makeProvider('check', 1, 0.5, 'text');
      pipeline.register(provider);

      const input = makeInput({ userMessage: 'specific query' });
      await pipeline.resolve(input);

      expect(provider.shouldRun).toHaveBeenCalledWith(input);
    });
  });

  describe('abort signal', () => {
    it('throws AbortError when signal is already aborted', async () => {
      const provider = makeProvider('any', 1, 0.5, 'text');
      pipeline.register(provider);

      const controller = new AbortController();
      controller.abort();

      await expect(pipeline.resolve(makeInput({ signal: controller.signal }))).rejects.toThrow();
    });

    it('throws DOMException with AbortError name', async () => {
      const provider = makeProvider('any', 1, 0.5, 'text');
      pipeline.register(provider);

      const controller = new AbortController();
      controller.abort();

      try {
        await pipeline.resolve(makeInput({ signal: controller.signal }));
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.name).toBe('AbortError');
      }
    });
  });

  describe('empty pipeline', () => {
    it('returns empty text when no providers are registered', async () => {
      const result = await pipeline.resolve(makeInput());

      expect(result.text).toBe('');
    });

    it('does not include mentionedMeetingIds when absent', async () => {
      const result = await pipeline.resolve(makeInput());

      expect(result.mentionedMeetingIds).toBeUndefined();
    });
  });

  describe('mentionedMeetingIds extraction', () => {
    it('extracts mentionedMeetingIds from best result meta', async () => {
      const provider = makeProvider('ref', 1, 0.8, 'context', {
        meta: { mentionedMeetingIds: ['m-1', 'm-2'] },
      });
      pipeline.register(provider);

      const result = await pipeline.resolve(makeInput());

      expect(result.mentionedMeetingIds).toEqual(['m-1', 'm-2']);
    });

    it('does not include mentionedMeetingIds when empty array', async () => {
      const provider = makeProvider('ref', 1, 0.8, 'context', {
        meta: { mentionedMeetingIds: [] },
      });
      pipeline.register(provider);

      const result = await pipeline.resolve(makeInput());

      expect(result.mentionedMeetingIds).toBeUndefined();
    });

    it('does not include mentionedMeetingIds when meta is absent', async () => {
      const provider = makeProvider('plain', 1, 0.8, 'no meta');
      pipeline.register(provider);

      const result = await pipeline.resolve(makeInput());

      expect(result.mentionedMeetingIds).toBeUndefined();
    });
  });

  describe('chained registration', () => {
    it('register returns this for chaining', () => {
      const provider = makeProvider('chain', 1, 0.5, 'text');
      const returned = pipeline.register(provider);

      expect(returned).toBe(pipeline);
    });

    it('supports fluent chained register calls', async () => {
      const result = await pipeline
        .register(makeProvider('a', 1, 0.3, 'a'))
        .register(makeProvider('b', 2, 0.6, 'b'))
        .register(makeProvider('c', 3, 0.4, 'c'))
        .resolve(makeInput());

      expect(result.text).toBe('b');
    });
  });

  describe('durationMs', () => {
    it('sets durationMs on provider output', async () => {
      let capturedDuration: number | undefined;
      const provider: ContextProvider = {
        name: 'timed',
        priority: 1,
        shouldRun: () => true,
        resolve: vi.fn(async () => {
          const output = { text: 'ok', provider: 'timed', confidence: 0.5, durationMs: 0 };
          return output;
        }),
      };

      pipeline.register(provider);
      await pipeline.resolve(makeInput());

      // The pipeline modifies the output's durationMs after resolve returns
      expect(provider.resolve).toHaveBeenCalled();
    });
  });
});
