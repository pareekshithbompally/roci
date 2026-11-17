/** Renders image, audio, and video chat parts; an image opens full size over the window (kit Lightbox) on click. */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { imagesService } from '@services/storage';
import { queryKeys } from '@shared/query/queryKeys';
import { FileText } from 'lucide-react';
import { Icon, Lightbox, Surface, Text, Thumbnail } from '@shared/ui';
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

interface MediaPartRendererProps {
  part: ChatPart;
}

export const MediaPartRenderer: React.FC<MediaPartRendererProps> = ({ part }) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const src = useMediaSrc(part);

  // Every hook runs before this early return (rules of hooks); the rest is plain derivation.
  if (part.type === 'text' || part.type === 'reasoning' || part.type === 'tool_call') return null;
  const handleOpen = () => setLightboxOpen(true);

  switch (part.type) {
    case 'image':
      return (
        <>
          <div className="my-2 max-w-xs">
            <Thumbnail src={src ?? ''} alt={part.alt || 'AI generated image'} onOpen={handleOpen} shape="natural" />
          </div>
          {src && <Lightbox src={src} alt={part.alt || 'AI generated image'} open={lightboxOpen} onOpenChange={setLightboxOpen} />}
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
