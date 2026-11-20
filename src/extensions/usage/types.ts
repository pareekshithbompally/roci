/** Mirrors the Rust UsageRecord / UsageSummary structs in commands.rs. */

export type UsageCategory = 'chat' | 'chat-extras' | 'transcription' | 'summary' | 'liveNotes';

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
  /** USD; absent when a cloud model's price is unknown (stored as NULL, never as free). */
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

/** One trend bucket (Rust `UsageBucket`): `key` is the local date `YYYY-MM-DD` or month `YYYY-MM`. */
export interface UsageBucket {
  key: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  estimated_cost: number;
}

/** Calendar bucket for a trend, in local time. */
export type UsageBucketSize = 'day' | 'month';

/** Which usage to sum (Rust `UsageQuery`): window `[since, until)` in epoch ms, optional trend buckets. */
export interface UsageQuery {
  since?: number;
  until?: number;
  bucket?: UsageBucketSize;
}

export interface UsageSummary {
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_calls: number;
  /** Calls whose cost is unknown (a cloud model models.dev has no price for); left out of `total_cost`. */
  unpriced_calls: number;
  /** Earliest record in the window (epoch ms); null when the window is empty. */
  first_timestamp: number | null;
  by_provider_model: ProviderModelBreakdown[];
  by_category: CategoryBreakdown[];
  /** Totals per bucket that has records, oldest first; empty unless the query asked for buckets. */
  trend: UsageBucket[];
}
