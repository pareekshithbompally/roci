/** Token estimates where no tokenizer is at hand (budgets, the Tools menu, the context ring). */

export const TOKEN_ESTIMATE = {
  /** Characters per token, conservative: an estimate runs a little high, never low. */
  charsPerToken: 3,
} as const;
