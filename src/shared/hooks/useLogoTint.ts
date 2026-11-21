/** The colour of a logo a component has drawn, for a badge tinted by it: read once per image from its saturated pixels
 *  (cached by TanStack Query); none for a mono logo, one the browser won't let a page read, or no logo at all. */

import { useEffect, useState, type DependencyList, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@shared/query/queryKeys';
import { UI_CONFIG } from '@config/ui.config';

const T = UI_CONFIG.logoTint;

/** The mean of the logo's coloured pixels as `rgb()`, or null when too little of it is coloured to say. */
function colourOf(pixels: Uint8ClampedArray): string | null {
  let r = 0, g = 0, b = 0, coloured = 0, opaque = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    opaque++;
    const max = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
    const min = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (max / 255 < T.minBrightness || (max - min) / max < T.minSaturation) continue;
    r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2];
    coloured++;
  }
  if (!opaque || coloured / opaque < T.minShare) return null;
  return `rgb(${Math.round(r / coloured)} ${Math.round(g / coloured)} ${Math.round(b / coloured)})`;
}

async function readTint(src: string): Promise<string | null> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = src;
  try {
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = T.samplePx;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, T.samplePx, T.samplePx);
    return colourOf(context.getImageData(0, 0, T.samplePx, T.samplePx).data);
  } catch (error: unknown) {
    // another site's logo without CORS can't be read: the badge stays neutral
    console.warn('[useLogoTint] Logo not readable:', src, error);
    return null;
  }
}

/** The tint of the logo drawn inside `ref`; re-read when `deps` change (another model). */
export function useLogoTint(ref: RefObject<HTMLElement | null>, deps: DependencyList): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const image = ref.current?.querySelector('img');
    if (!image) return setSrc(null);
    const read = () => setSrc(image.currentSrc || image.src);
    if (image.complete) return read();
    image.addEventListener('load', read, { once: true });
    return () => image.removeEventListener('load', read);
    // the caller names what changes the logo
  }, deps);
  const { data } = useQuery({
    queryKey: queryKeys.logoTint(src ?? ''),
    queryFn: () => readTint(src as string),
    enabled: !!src,
    staleTime: Infinity,
  });
  return data ?? null;
}
