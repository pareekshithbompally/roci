/** Renders image, audio, and video chat parts; images open a fullscreen lightbox on click. */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { X, FileText } from 'lucide-react';
import { UI_CONFIG } from '@config/ui.config';
import { Button, IconButton, Icon, Surface, Text } from '@shared/ui';
import type { ChatPart, MediaSource } from '@shared/types';

/** Resolve a MediaSource to a URL usable in src attributes */
function resolveMediaSrc(source: MediaSource, mimeType: string): string {
  switch (source.kind) {
    case 'url':
      return source.url;
    case 'data':
      return `data:${mimeType};base64,${source.base64}`;
    case 'file':
      return source.path;
  }
}

/** Fullscreen lightbox for viewing images at native resolution */
const ImageLightbox: React.FC<{ src: string; alt: string; onClose: () => void }> = ({
  src,
  alt,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <Surface
      variant="scrim"
      className="fixed inset-0 flex items-center justify-center animate-in fade-in duration-200"
      style={{ zIndex: UI_CONFIG.zIndex.modal }}
      onClick={onClose}
    >
      <IconButton icon={X} label="Close" variant="secondary" className="absolute top-4 right-4" onClick={onClose} />
      <Surface radius="lg" className="overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={alt} className="block max-w-[90vw] max-h-[90vh] object-contain" />
      </Surface>
    </Surface>
  );
};

interface MediaPartRendererProps {
  part: ChatPart;
}

export const MediaPartRenderer: React.FC<MediaPartRendererProps> = ({ part }) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (part.type === 'text' || part.type === 'tool_call') return null;

  const src = useMemo(() => resolveMediaSrc(part.source, part.mimeType), [part]);
  const handleOpen = useCallback(() => setLightboxOpen(true), []);
  const handleClose = useCallback(() => setLightboxOpen(false), []);

  switch (part.type) {
    case 'image':
      return (
        <>
          <Button variant="ghost" size="inline" onClick={handleOpen} className="my-2 max-w-xs hover:opacity-90">
            <Surface radius="lg" className="overflow-hidden">
              <img
                src={src}
                alt={part.alt || 'AI generated image'}
                className="block w-full h-auto"
                loading="lazy"
              />
            </Surface>
          </Button>
          {lightboxOpen && (
            <ImageLightbox
              src={src}
              alt={part.alt || 'AI generated image'}
              onClose={handleClose}
            />
          )}
        </>
      );
    case 'audio':
      return (
        <audio
          src={src}
          controls
          className="w-full my-2"
          preload="metadata"
        />
      );
    case 'video':
      return (
        <Surface radius="lg" className="max-w-xs my-2 overflow-hidden">
          <video src={src} controls className="block w-full h-auto" preload="metadata">
            {part.alt || 'AI generated video'}
          </video>
        </Surface>
      );
    case 'document':
      return (
        <Surface variant="subtle" radius="lg" className="flex items-center gap-2 px-3 py-2 my-1">
          <Icon icon={FileText} size="sm" tone="muted" className="shrink-0" />
          <Text variant="helper" truncate className="max-w-48">{part.fileName}</Text>
        </Surface>
      );
    default:
      return null;
  }
};

export default MediaPartRenderer;
