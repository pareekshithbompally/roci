// Minimal className merge of truthy strings; we control both sides, so no tailwind-merge is needed.
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Ends text entry (the iOS keyboard and the caret) before a sheet or the sidebar moves over the field, as iOS does —
 * WebKit draws the caret in its own layer, so it would not travel with sliding content. A field inside `keep` stays focused.
 */
export function dismissKeyboard(keep?: Element | null): void {
  const field = document.activeElement;
  if (!(field instanceof HTMLElement) || keep?.contains(field)) return;
  if (field.matches('input, textarea, [contenteditable="true"]')) field.blur();
}
