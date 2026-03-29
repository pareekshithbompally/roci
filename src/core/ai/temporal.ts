/**
 * Temporal Context for LLM Prompts
 *
 * Single source of truth for formatting the current date, time, and timezone
 * into a string suitable for LLM system prompts. Every LLM call site that
 * needs temporal awareness imports this function.
 *
 * Uses the browser's Intl API for timezone detection — no settings field needed
 * for a single-user desktop app.
 */

/**
 * Format the current date, time, and timezone for LLM consumption.
 *
 * Returns a string like:
 *   "Current date: 2026-03-29 (Saturday). Time: 13:54 local. Timezone: America/Los_Angeles."
 *
 * Call once per LLM request and thread through — don't call multiple times
 * within the same request to avoid sub-second drift.
 */
export function formatTemporalContext(): string {
  const now = new Date();

  const isoDate = now.toISOString().split('T')[0];
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');

  let timezone: string;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timezone = 'Unknown';
  }

  return `Current date: ${isoDate} (${weekday}). Time: ${hours}:${minutes} local. Timezone: ${timezone}.`;
}
