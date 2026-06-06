/**
 * MediaPartRenderer Component
 *
 * Renders non-text chat parts (images, audio, video) from multimodal AI responses.
 * Images display as constrained thumbnails; clicking opens a fullscreen lightbox.
 * Resolves MediaSource to a renderable src URL regardless of source kind.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { X, FileText } from 'lucide-react';
import { UI_CONFIG } from '@config/ui.config';
import { SURFACE, TEXT } from '@config/theme.config';
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
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      style={{ zIndex: UI_CONFIG.zIndex.modal }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-black/40 hover:bg-black/60 rounded-full transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
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
          <button
            type="button"
            onClick={handleOpen}
            className="block my-2 rounded-lg overflow-hidden cursor-zoom-in hover:opacity-90 transition-opacity max-w-xs"
          >
            <img
              src={src}
              alt={part.alt || 'AI generated image'}
              className="w-full h-auto rounded-lg"
              loading="lazy"
            />
          </button>
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
          className="w-full my-2 rounded-lg"
          preload="metadata"
        />
      );
    case 'video':
      return (
        <video
          src={src}
          controls
          className="max-w-xs h-auto rounded-lg my-2"
          preload="metadata"
        >
          {part.alt || 'AI generated video'}
        </video>
      );
    case 'document':
      return (
        <div className={`flex items-center gap-2 px-3 py-2 my-1 ${SURFACE.selectedCard} rounded-lg`}>
          <FileText className={`w-4 h-4 shrink-0 ${TEXT.muted}`} />
          <span className="text-xs truncate max-w-[200px]">{part.fileName}</span>
        </div>
      );
    default:
      return null;
  }
};

export default MediaPartRenderer;
