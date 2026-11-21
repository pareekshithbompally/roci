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

/** A token's value as it is now (light or dark), for a mark a canvas library colours itself (charts, graphs). */
export const cssToken = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

let colourCanvas: CanvasRenderingContext2D | null = null;

/** A token's colour as `#rrggbb` or `rgba(r, g, b, a)`, for WebGL libraries whose parsers miss modern CSS (`rgb(0 0 0 / .2)`,
 *  `color-mix()`): the browser resolves it, a canvas writes it back in the classic form. */
export function cssColour(name: string): string {
  const resolved = cssToken(name);
  colourCanvas ??= document.createElement('canvas').getContext('2d');
  if (!colourCanvas) return resolved;
  colourCanvas.fillStyle = resolved;
  return String(colourCanvas.fillStyle);
}
