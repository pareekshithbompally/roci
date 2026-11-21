/** Renders a chat's media: attached files and tool-made images (an image opens in the kit Lightbox); a removed file shows as removed. */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { assetsService } from '@services/storage';
import { store } from '@services/db';
import { queryKeys } from '@shared/query/queryKeys';
import { FileText, FileX, ImageOff, VideoOff, VolumeX, type LucideIcon } from 'lucide-react';
import { Icon, Lightbox, Surface, Text, Thumbnail } from '@shared/ui';
import { RemovedNotice } from '@shared/components';
import { StorageConfig } from '@config/storage.config';
import type { FileUIPart, GeneratedImage } from '@shared/types';
import { mediaKind, type MediaKind } from '@shared/utils/chatParts';

/** What a message shows as media: an attached file (the SDK's file part), or an image a tool made. */
export type ChatMedia = FileUIPart | GeneratedImage;

const REMOVED_ICON: Record<MediaKind, LucideIcon> = { image: ImageOff, audio: VolumeX, video: VideoOff, document: FileX };

/** A kept file's URL through Tauri's asset protocol, or null once its asset row is gone. */
async function keptFileUrl(appPath: string): Promise<string | null> {
  return (await store.assets.exists(appPath)) ? assetsService.fileUrl(appPath) : null;
}

/** The media's `src`: an attachment's own URL, a kept file's cached asset URL, or null once the file was removed. */
function useMediaSrc(media: ChatMedia): string | null | undefined {
  const appPath = 'path' in media ? media.path : null;
  const { data: fileUrl } = useQuery({
    queryKey: queryKeys.appFileUrl(appPath ?? ''),
    queryFn: () => keptFileUrl(appPath ?? ''),
    enabled: appPath !== null,
    staleTime: Infinity,
  });
  return 'url' in media ? media.url : fileUrl;
}

interface MediaPartRendererProps {
  media: ChatMedia;
}

export const MediaPartRenderer: React.FC<MediaPartRendererProps> = ({ media }) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const src = useMediaSrc(media);
  const kind = mediaKind(media.mediaType);
  const name = 'url' in media ? media.filename : media.alt;

  if (src === null) return <RemovedNotice icon={REMOVED_ICON[kind]} label={StorageConfig.removed[kind]} />;
  const handleOpen = () => setLightboxOpen(true);

  switch (kind) {
    case 'image':
      return (
        <>
          <div className="my-2 max-w-xs">
            <Thumbnail src={src ?? ''} alt={name || 'AI generated image'} onOpen={handleOpen} shape="natural" />
          </div>
          {src && <Lightbox src={src} alt={name || 'AI generated image'} open={lightboxOpen} onOpenChange={setLightboxOpen} />}
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
            {name || 'AI generated video'}
          </video>
        </Surface>
      );
    case 'document':
      return (
        <Surface variant="subtle" radius="lg" className="flex items-center gap-2 px-3 py-2 my-1">
          <Icon icon={FileText} size="sm" tone="muted" className="shrink-0" />
          <Text variant="helper" truncate className="max-w-48">{name}</Text>
        </Surface>
      );
  }
};

export default MediaPartRenderer;
