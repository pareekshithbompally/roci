/** Renders image, audio, and video chat parts; images open a fullscreen lightbox on click. */

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { imagesService } from '@services/storage';
import { queryKeys } from '@shared/query/queryKeys';
import { X, FileText } from 'lucide-react';
import { Button, IconButton, Icon, Surface, Text } from '@shared/ui';
import type { ChatPart, MediaSource } from '@shared/types';

/** A part's `src`: a URL or inline data as is; a file in app data through Tauri's asset protocol, resolved once and cached. */
function useMediaSrc(part: ChatPart): string | undefined {
  const media = part.type !== 'text' && part.type !== 'reasoning' && part.type !== 'tool_call' ? part : null;
  const source: MediaSource | null = media?.source ?? null;
  const file = source?.kind === 'file' ? source.path : null;
  const { data: fileUrl } = useQuery({
    queryKey: queryKeys.appFileUrl(file ?? ''),
    queryFn: () => imagesService.fileUrl(file ?? ''),
    enabled: file !== null,
    staleTime: Infinity,
  });
  if (!media || !source) return undefined;
  if (source.kind === 'url') return source.url;
  if (source.kind === 'data') return `data:${media.mimeType};base64,${source.base64}`;
  return fileUrl;
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
      className="fixed inset-0 z-modal flex items-center justify-center animate-fade-in"
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
  const src = useMediaSrc(part);

  // Every hook runs before this early return (rules of hooks); the rest is plain derivation.
  if (part.type === 'text' || part.type === 'reasoning' || part.type === 'tool_call') return null;
  const handleOpen = () => setLightboxOpen(true);
  const handleClose = () => setLightboxOpen(false);

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
