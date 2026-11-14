/**
 * Live value of a design-token role (src/styles/tokens.css) for APIs that take
 * colour strings instead of classes — canvas, WaveSurfer. Re-read after a theme
 * change (the `.dark` class swaps the roles).
 */
export function cssToken(name: `--${string}`): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
