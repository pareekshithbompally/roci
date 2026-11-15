/** Runs ContextProviders by priority; a result with confidence >= 0.9 short-circuits, provider errors are logged. */

import type { ContextInput, ContextOutput, ContextProvider, ContextPipelineResult } from './types';

const EMPTY_OUTPUT: ContextOutput = {
  text: '',
  provider: 'none',
  confidence: 0,
  durationMs: 0,
};

export class ContextPipeline {
  private providers: ContextProvider[] = [];

  register(provider: ContextProvider): this {
    this.providers.push(provider);
    this.providers.sort((a, b) => a.priority - b.priority);
    return this;
  }

  async resolve(input: ContextInput): Promise<ContextPipelineResult> {
    let bestOutput = EMPTY_OUTPUT;

    for (const provider of this.providers) {
      // Check abort before running each provider
      if (input.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      if (!provider.shouldRun(input)) continue;

      const start = Date.now();
      try {
        const output = await provider.resolve(input);
        output.durationMs = Date.now() - start;

        console.log(`[ContextPipeline] ${provider.name}: confidence=${output.confidence.toFixed(2)}, duration=${output.durationMs}ms`);

        if (output.confidence > bestOutput.confidence && output.text) {
          bestOutput = output;
        }

        // Short-circuit on high confidence
        if (output.confidence >= 0.9 && output.text) {
          break;
        }
      } catch (error: unknown) {
        // Re-throw aborts, matched on `name` because DOMException is not an Error instance.
        const errorName =
          error instanceof Error
            ? error.name
            : typeof error === 'object' && error !== null && 'name' in error
              ? (error as { name?: unknown }).name
              : undefined;
        if (errorName === 'AbortError') throw error;

        console.error(`[ContextPipeline] ${provider.name} failed (fail-open):`, error);
        // Continue to next provider
      }
    }

    // Extract mentionedMeetingIds from meta if present
    const mentionedMeetingIds = bestOutput.meta?.mentionedMeetingIds as string[] | undefined;

    return {
      text: bestOutput.text,
      ...(mentionedMeetingIds?.length && { mentionedMeetingIds }),
    };
  }
}
