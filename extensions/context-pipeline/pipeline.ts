/**
 * Context Pipeline
 *
 * Runs registered ContextProviders in priority order.
 * First high-confidence result (>=0.9) short-circuits.
 * Fail-open: provider errors are caught and logged, pipeline continues.
 */

import type { ContextInput, ContextOutput, ContextProvider } from './types';

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

  async resolve(input: ContextInput): Promise<string> {
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
      } catch (error: any) {
        // Re-throw abort errors
        if (error.name === 'AbortError') throw error;

        console.error(`[ContextPipeline] ${provider.name} failed (fail-open):`, error);
        // Continue to next provider
      }
    }

    return bestOutput.text;
  }
}
