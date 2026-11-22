import type React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { IconButton } from './button';
import { SCRIM } from './recipes';
import { cn } from './utils';
import { platform } from '@platform/index';
import { KIT_COPY } from '@config/kitCopy.config';

/** Room around what is shown: iPhone keeps clear of the close button and the home bar; the Mac leaves an even margin. */
const FRAME = platform.hasTouchScreen ? 'px-4 pt-20 pb-sheet-end' : 'p-16';

/** What the viewer shows: an image at its own size, or a PDF filling the window (WebKit draws it). */
export type ViewerMedia = { kind: 'image'; src: string; alt: string } | { kind: 'pdf'; src: string; title: string };

export interface ViewerProps {
  media: ViewerMedia;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown under it (an image's prompt, details, actions); clicks on it don't close the viewer. */
  caption?: React.ReactNode;
}

const nameOf = (media: ViewerMedia) => (media.kind === 'image' ? media.alt : media.title);

function Body({ media }: { media: ViewerMedia }) {
  if (media.kind === 'image') return <img src={media.src} alt={media.alt} className="min-h-0 max-w-full rounded-lg object-contain shadow-overlay" />;
  return <iframe src={media.src} title={media.title} className="min-h-0 w-full flex-1 rounded-lg bg-base shadow-overlay" />;
}

/** An image or a PDF over the whole window (portalled, so no panel clips it): scrim, Escape or a click outside closes it. */
export function Viewer({ media, open, onOpenChange, caption }: ViewerProps) {
  const fills = media.kind === 'pdf';
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={SCRIM} />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          // Focus stays on the viewer, not inside a PDF's frame, whose own document would take Escape.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).focus();
          }}
          className={cn('fixed inset-0 z-modal flex items-center justify-center outline-none data-[state=open]:animate-fade-in', FRAME)}
          onClick={() => onOpenChange(false)}
        >
          <DialogPrimitive.Title className="sr-only">{nameOf(media)}</DialogPrimitive.Title>
          <div className={cn('flex max-h-full max-w-full flex-col items-center gap-4', fills && 'size-full')} onClick={(e) => e.stopPropagation()}>
            <Body media={media} />
            {caption && <div className="w-full max-w-xl shrink-0">{caption}</div>}
          </div>
          <DialogPrimitive.Close asChild>
            <IconButton icon={X} label={KIT_COPY.close} size="fab" variant="bar" className="absolute top-safe-top right-4 mt-4" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
