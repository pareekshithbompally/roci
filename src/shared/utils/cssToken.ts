/** Live value of a token role for colour-string APIs (canvas, WaveSurfer); re-read after a theme change. */
export function cssToken(name: `--${string}`): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** One-pixel canvas that turns any CSS colour into its sRGB bytes. */
let swatch: CanvasRenderingContext2D | null = null;

/**
 * A colour token as sRGB 0–1 components, for canvas maths. The browser
 * resolves it as `element`'s computed colour, so the token can use any colour
 * syntax; a one-pixel draw then gives its bytes, with no string parsing.
 * Read once per theme, not per frame.
 */
export function tokenRgb(element: HTMLElement, name: `--${string}`): readonly [number, number, number] {
  const previous = element.style.color;
  element.style.color = `var(${name})`;
  const color = getComputedStyle(element).color;
  element.style.color = previous;
  swatch ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!swatch) throw new Error('[cssToken] No 2D canvas to read a colour with');
  swatch.clearRect(0, 0, 1, 1);
  swatch.fillStyle = color;
  swatch.fillRect(0, 0, 1, 1);
  const [r, g, b] = swatch.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}
