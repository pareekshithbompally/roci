/** Compact token count and cost formatters for the usage UI. */

/** Format token count with SI suffixes: "1.2k", "125.3k", "1.5M" */
export function formatTokenCount(n: number): string {
  if (n === 0) return '0';
  if (n < 1_000) return String(n);
  if (n < 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n < 10_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** Format USD cost: "Free", "< $0.01", "$0.30", "$12.45"; `precise` shows sub-cent averages to two significant digits ("$0.0042"). */
export function formatCost(usd: number, precise = false): string {
  if (usd === 0) return 'Free';
  if (usd < 0.01) return precise ? `$${Number(usd.toPrecision(2))}` : '< $0.01';
  return `$${usd.toFixed(2)}`;
}
