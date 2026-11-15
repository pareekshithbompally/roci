/** Tracks cumulative context size across tool calls and @mentions so retrieval can't grow unbounded. */

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

  /** Adds text, truncated to fit, consumes that much budget, and returns what was added. */
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
