/** An image as a pressable, rounded tile that opens it: `square` crops to fill (gallery grids), `natural` keeps its
 *  shape (an image in a reply). */

import { cn } from './utils';

export interface ThumbnailProps {
  src: string;
  /** What the image shows (VoiceOver, and the hover tag on a Mac). */
  alt: string;
  onOpen: () => void;
  shape?: 'square' | 'natural';
}

export function Thumbnail({ src, alt, onOpen, shape = 'square' }: ThumbnailProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={alt}
      aria-label={alt}
      className={cn(
        'relative block w-full overflow-hidden rounded-xl bg-layer-2 shadow-input outline-none',
        shape === 'square' && 'aspect-square',
        'transition-opacity hover:opacity-90 active:opacity-60 focus-visible:ring-2 focus-visible:ring-focus',
      )}
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className={shape === 'square' ? 'h-full w-full object-cover' : 'block h-auto w-full'}
      />
    </button>
  );
}
