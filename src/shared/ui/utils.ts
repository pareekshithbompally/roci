// Minimal className merge of truthy strings; we control both sides, so no tailwind-merge is needed.
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
