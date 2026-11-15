import type { CSSProperties } from 'react';

/**
 * Content fading out at a box's edges instead of being cut: a mask, `top` /
 * `bottom` px long. None when neither edge fades.
 */
export function edgeFade({ top = 0, bottom = 0 }: { top?: number; bottom?: number }): CSSProperties | undefined {
  if (!top && !bottom) return undefined;
  const start = top ? `transparent, black ${top}px` : 'black';
  const end = bottom ? `black calc(100% - ${bottom}px), transparent` : 'black';
  const mask = `linear-gradient(to bottom, ${start}, ${end})`;
  return { maskImage: mask, WebkitMaskImage: mask };
}
