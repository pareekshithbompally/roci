/** Current date, time and timezone (from Intl) formatted for LLM system prompts. */

/** Call once per LLM request and thread it through, so one request never sees two different times. */
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
