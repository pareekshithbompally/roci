/** Mirrors the Rust UsageRecord / UsageSummary structs in commands.rs. */

export type UsageCategory = 'chat' | 'title-gen' | 'transcription' | 'summary' | 'extraction' | 'suggestions';

export interface UsageRecord {
  id: string;
  timestamp: number;
  category: UsageCategory;
  session_id?: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  reasoning_tokens?: number;
  estimated_cost?: number;
}

export interface ProviderModelBreakdown {
  provider: string;
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  estimated_cost: number;
}

export interface CategoryBreakdown {
  category: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
}

export interface UsageSummary {
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_calls: number;
  by_provider_model: ProviderModelBreakdown[];
  by_category: CategoryBreakdown[];
}
