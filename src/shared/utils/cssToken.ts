/** Live value of a token role for colour-string APIs (canvas, WaveSurfer); re-read after a theme change. */
export function cssToken(name: `--${string}`): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
