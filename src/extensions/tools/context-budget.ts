/**
 * LLM Context Budget
 *
 * Tracks cumulative context size across tool calls and @mentions.
 * Prevents unbounded accumulation in the retrieval executor.
 *
 * Usage:
 *   const budget = new LLMContextBudget(MAX_CONTEXT_BUDGET_CHARS);
 *   const fitted = budget.add(toolResult);  // returns truncated-to-fit version
 *   if (!budget.canFit(nextResult)) { ... } // check before expensive work
 */

import { truncateForLLM } from '@shared/utils/text.utils';

export class LLMContextBudget {
  private used = 0;

  constructor(private readonly maxChars: number) {}

  /** How many characters remain in the budget */
  remaining(): number {
    return Math.max(0, this.maxChars - this.used);
  }

  /** Whether the given text fits (even partially) in the remaining budget */
  canFit(text: string): boolean {
    // Allow at least 200 chars to be useful
    return this.remaining() >= Math.min(200, text.length);
  }

  /** Whether the budget is fully exhausted */
  isExhausted(): boolean {
    return this.remaining() === 0;
  }

  /**
   * Add text to the budget, truncating if necessary.
   * Returns the (possibly truncated) text that was added.
   * Consumes the corresponding amount from the budget.
   */
  add(text: string): string {
    if (!text) return text;

    const remaining = this.remaining();
    if (remaining === 0) return '';

    const fitted = text.length <= remaining
      ? text
      : truncateForLLM(text, remaining);

    this.used += fitted.length;
    return fitted;
  }

  /** Manually consume budget (e.g., for system prompt overhead) */
  consume(chars: number): void {
    this.used += chars;
  }
}
