/** An image as a square tile in a grid (the gallery): rounded, cropped to fill, a press target that opens it. */

import { cn } from './utils';

export interface ThumbnailProps {
  src: string;
  /** What the image shows (VoiceOver, and the hover tag on a Mac). */
  alt: string;
  onOpen: () => void;
}

export function Thumbnail({ src, alt, onOpen }: ThumbnailProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={alt}
      aria-label={alt}
      className={cn(
        'relative aspect-square w-full overflow-hidden rounded-xl bg-layer-2 shadow-input outline-none',
        'transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-focus',
      )}
    >
      <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
    </button>
  );
}
