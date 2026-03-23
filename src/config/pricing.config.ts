/**
 * Model Pricing Configuration
 *
 * Static pricing data for major LLM providers. Rates are per 1M tokens in USD.
 * Used to estimate costs in the usage tracking system.
 *
 * Lookup: exact model ID match first, then longest prefix match.
 * Updated: March 2026. Prices may drift — this is for relative cost comparison,
 * not invoicing.
 */

export interface ModelPricing {
  /** USD per 1M input tokens */
  inputPer1M: number;
  /** USD per 1M output tokens */
  outputPer1M: number;
  /** USD per 1M cached input tokens (read from cache) */
  cacheReadPer1M?: number;
  /** USD per 1M cache write tokens */
  cacheWritePer1M?: number;
}

/**
 * Provider → model prefix → pricing.
 * Keys are matched against model IDs: exact match first, then longest prefix.
 */
export const PROVIDER_PRICING: Record<string, Record<string, ModelPricing>> = {
  openai: {
    // GPT-4.1 family
    'gpt-4.1': { inputPer1M: 2.00, outputPer1M: 8.00 },
    'gpt-4.1-mini': { inputPer1M: 0.40, outputPer1M: 1.60 },
    'gpt-4.1-nano': { inputPer1M: 0.05, outputPer1M: 0.20 },
    // GPT-4o family
    'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.60, cacheReadPer1M: 0.075 },
    'gpt-4o': { inputPer1M: 2.50, outputPer1M: 10.00, cacheReadPer1M: 1.25 },
    // Reasoning models
    'o4-mini': { inputPer1M: 1.10, outputPer1M: 4.40, cacheReadPer1M: 0.275 },
    'o3': { inputPer1M: 2.00, outputPer1M: 8.00, cacheReadPer1M: 0.50 },
    'o3-mini': { inputPer1M: 1.10, outputPer1M: 4.40, cacheReadPer1M: 0.275 },
    'o1': { inputPer1M: 15.00, outputPer1M: 60.00, cacheReadPer1M: 7.50 },
    'o1-mini': { inputPer1M: 1.10, outputPer1M: 4.40 },
  },

  anthropic: {
    // Claude 4.x family
    'claude-opus-4': { inputPer1M: 5.00, outputPer1M: 25.00, cacheReadPer1M: 0.50, cacheWritePer1M: 6.25 },
    'claude-sonnet-4': { inputPer1M: 3.00, outputPer1M: 15.00, cacheReadPer1M: 0.30, cacheWritePer1M: 3.75 },
    // Claude 3.5 family
    'claude-3-5-sonnet': { inputPer1M: 3.00, outputPer1M: 15.00, cacheReadPer1M: 0.30, cacheWritePer1M: 3.75 },
    'claude-3-5-haiku': { inputPer1M: 0.80, outputPer1M: 4.00, cacheReadPer1M: 0.08, cacheWritePer1M: 1.00 },
    // Claude 3 family
    'claude-3-opus': { inputPer1M: 15.00, outputPer1M: 75.00, cacheReadPer1M: 1.50, cacheWritePer1M: 18.75 },
    'claude-3-haiku': { inputPer1M: 0.25, outputPer1M: 1.25, cacheReadPer1M: 0.03, cacheWritePer1M: 0.30 },
  },

  gemini: {
    // Gemini 2.5 family
    'gemini-2.5-pro': { inputPer1M: 1.25, outputPer1M: 10.00 },
    'gemini-2.5-flash': { inputPer1M: 0.15, outputPer1M: 0.60 },
    // Gemini 2.0 family
    'gemini-2.0-flash': { inputPer1M: 0.10, outputPer1M: 0.40 },
    // Fallback for latest aliases
    'gemini-flash-latest': { inputPer1M: 0.15, outputPer1M: 0.60 },
    'gemini-flash-lite-latest': { inputPer1M: 0.02, outputPer1M: 0.10 },
    'gemini-3-pro-preview': { inputPer1M: 1.25, outputPer1M: 10.00 },
    'gemini-3-flash-preview': { inputPer1M: 0.15, outputPer1M: 0.60 },
  },

  mistral: {
    'mistral-large': { inputPer1M: 2.00, outputPer1M: 6.00 },
    'mistral-medium': { inputPer1M: 0.40, outputPer1M: 2.00 },
    'mistral-small': { inputPer1M: 0.20, outputPer1M: 0.60 },
    'pixtral-large': { inputPer1M: 2.00, outputPer1M: 6.00 },
    'codestral': { inputPer1M: 0.30, outputPer1M: 0.90 },
    'ministral-8b': { inputPer1M: 0.10, outputPer1M: 0.10 },
  },

  xai: {
    'grok-4': { inputPer1M: 3.00, outputPer1M: 15.00 },
    'grok-3': { inputPer1M: 3.00, outputPer1M: 15.00 },
    'grok-3-mini': { inputPer1M: 0.30, outputPer1M: 0.50 },
    'grok-3-fast': { inputPer1M: 5.00, outputPer1M: 25.00 },
  },

  groq: {
    // Groq-hosted models — pricing varies by model
    'llama-3.3-70b': { inputPer1M: 0.59, outputPer1M: 0.79 },
    'llama-3.1-8b': { inputPer1M: 0.05, outputPer1M: 0.08 },
    'llama-3.1-70b': { inputPer1M: 0.59, outputPer1M: 0.79 },
    'llama-4-maverick': { inputPer1M: 0.27, outputPer1M: 0.85 },
    'deepseek-r1-distill-llama-70b': { inputPer1M: 0.75, outputPer1M: 0.99 },
    'gemma2-9b': { inputPer1M: 0.20, outputPer1M: 0.20 },
    'mixtral-8x7b': { inputPer1M: 0.24, outputPer1M: 0.24 },
  },
};
