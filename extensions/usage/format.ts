/**
 * Usage Display Formatting
 *
 * Compact token count and cost formatters for the usage UI.
 */

/** Format token count with SI suffixes: "1.2k", "125.3k", "1.5M" */
export function formatTokenCount(n: number): string {
  if (n === 0) return '0';
  if (n < 1_000) return String(n);
  if (n < 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n < 10_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** Format USD cost: "$0.00", "$1.23", "$12.45" */
export function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

/** Capitalize first letter of a string */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Friendly category label: 'title-gen' → 'Title Gen' */
export function formatCategory(category: string): string {
  return category.split('-').map(capitalize).join(' ');
}
