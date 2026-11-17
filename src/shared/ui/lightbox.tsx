import type React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { IconButton } from './button';
import { SCRIM } from './recipes';
import { cn } from './utils';
import { platform } from '@platform/index';

/** Room around the image: iPhone keeps clear of the close button and the home bar; the Mac leaves an even margin. */
const FRAME = platform.hasTouchScreen ? 'px-4 pt-20 pb-sheet-end' : 'p-16';

export interface LightboxProps {
  src: string;
  alt: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown under the image (its prompt, details, actions); clicks on it don't close the lightbox. */
  caption?: React.ReactNode;
}

/** An image at full size over the whole window (portalled, so no panel clips it): scrim, Escape or a click outside closes it. */
export function Lightbox({ src, alt, open, onOpenChange, caption }: LightboxProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={SCRIM} />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn('fixed inset-0 z-modal flex items-center justify-center outline-none data-[state=open]:animate-fade-in', FRAME)}
          onClick={() => onOpenChange(false)}
        >
          <DialogPrimitive.Title className="sr-only">{alt}</DialogPrimitive.Title>
          <div className="flex max-h-full max-w-full flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
            <img src={src} alt={alt} className="min-h-0 max-w-full rounded-lg object-contain shadow-overlay" />
            {caption && <div className="w-full max-w-xl shrink-0">{caption}</div>}
          </div>
          <DialogPrimitive.Close asChild>
            <IconButton icon={X} label="Close" size="fab" variant="bar" className="absolute top-safe-top right-4 mt-4" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
