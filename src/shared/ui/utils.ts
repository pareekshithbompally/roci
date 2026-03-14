// Minimal className merge — concatenates truthy strings.
// No clsx/tailwind-merge dependency needed for our use case
// since we control both sides (wrapper defaults + consumer overrides).
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
