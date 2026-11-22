/** Renders a chat's media: attached files and tool-made images (an image opens in the kit Lightbox, audio and video play in the
 *  shared players, a document opens in its default app on the Mac); a removed file shows as removed. */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { assetsService } from '@services/storage';
import { store } from '@services/db';
import { queryKeys } from '@shared/query/queryKeys';
import { FileText, FileX, ImageOff, VideoOff, VolumeX, type LucideIcon } from 'lucide-react';
import { Icon, Lightbox, Row, Surface, Text, Thumbnail } from '@shared/ui';
import { platform } from '@platform/index';
import { openAttachment } from '@features/chat/utils';
import { AudioPlayer, RemovedNotice, VideoPlayer } from '@shared/components';
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

/** Which media this is, for the playback session: a kept file by its path, an attachment by its URL. */
const mediaId = (media: ChatMedia): string => ('path' in media ? media.path : media.url);

/** A document by its name; on the Mac a press opens it in its default app. */
function DocumentChip({ media, name }: { media: ChatMedia; name?: string }) {
  const body = (
    <>
      <Icon icon={FileText} size="sm" tone="muted" className="shrink-0" />
      <Text variant="helper" truncate className="max-w-48">{name}</Text>
    </>
  );
  return (
    <Surface variant="subtle" radius="lg" className="my-1 inline-flex">
      {platform.hasFileManager && 'url' in media ? (
        <Row className="w-auto" aria-label={`Open ${name ?? 'file'}`} onClick={() => void openAttachment(media)}>{body}</Row>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2">{body}</div>
      )}
    </Surface>
  );
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
      // A kept file's URL arrives a moment later; the player mounts once it has one.
      if (!src) return null;
      return (
        <div className="my-2">
          <AudioPlayer session={{ id: mediaId(media), src, title: name || 'Audio', duration: 0 }} />
        </div>
      );
    case 'video':
      if (!src) return null;
      return (
        <div className="my-2 max-w-xs">
          <VideoPlayer src={src} label={name || 'Video'} />
        </div>
      );
    case 'document':
      return <DocumentChip media={media} name={name} />;
  }
};

export default MediaPartRenderer;
