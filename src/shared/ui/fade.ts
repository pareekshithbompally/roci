import type { CSSProperties } from 'react';

/** Mask that fades content out over `top` / `bottom` px instead of cutting it; none when neither edge fades. */
export function edgeFade({ top = 0, bottom = 0 }: { top?: number; bottom?: number }): CSSProperties | undefined {
  if (!top && !bottom) return undefined;
  const start = top ? `transparent, black ${top}px` : 'black';
  const end = bottom ? `black calc(100% - ${bottom}px), transparent` : 'black';
  const mask = `linear-gradient(to bottom, ${start}, ${end})`;
  return { maskImage: mask, WebkitMaskImage: mask };
}
