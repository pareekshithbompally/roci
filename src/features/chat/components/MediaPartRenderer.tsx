/** Renders a chat's media parts (an image opens in the kit Lightbox); a removed file shows as removed. */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { assetsService } from '@services/storage';
import { store } from '@services/db';
import { queryKeys } from '@shared/query/queryKeys';
import { FileText, FileX, ImageOff, VideoOff, VolumeX, type LucideIcon } from 'lucide-react';
import { Icon, Lightbox, Surface, Text, Thumbnail } from '@shared/ui';
import { RemovedNotice } from '@shared/components';
import { StorageConfig } from '@config/storage.config';
import type { ChatPart } from '@shared/types';
import { appFileOf, isMediaPart, type MediaPart } from '@shared/utils/chatParts';

const REMOVED_ICON: Record<MediaPart['type'], LucideIcon> = { image: ImageOff, audio: VolumeX, video: VideoOff, document: FileX };

/** A kept file's URL through Tauri's asset protocol, or null once its asset row is gone. */
async function keptFileUrl(appPath: string): Promise<string | null> {
  return (await store.assets.exists(appPath)) ? assetsService.fileUrl(appPath) : null;
}

/** A part's `src`: a URL or inline data as is, a kept file's cached asset URL, or null once the file was removed. */
function useMediaSrc(part: ChatPart): string | null | undefined {
  const media = isMediaPart(part) ? part : null;
  const source = media?.source ?? null;
  const file = appFileOf(part);
  const { data: fileUrl } = useQuery({
    queryKey: queryKeys.appFileUrl(file ?? ''),
    queryFn: () => keptFileUrl(file ?? ''),
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
  if (!isMediaPart(part)) return null;
  if (src === null) return <RemovedNotice icon={REMOVED_ICON[part.type]} label={StorageConfig.removed[part.type]} />;
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
