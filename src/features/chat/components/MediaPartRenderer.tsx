/** Renders a chat's media: attached files and tool-made images (an image or a PDF opens in the kit Viewer, audio and video play
 *  in the shared players, any other document opens in its default app on the Mac); a removed file shows as removed. */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { assetsService } from '@services/storage';
import { store } from '@services/db';
import { queryKeys } from '@shared/query/queryKeys';
import { FileText, FileX, ImageOff, VideoOff, VolumeX, type LucideIcon } from 'lucide-react';
import { Icon, Row, Surface, Text, Thumbnail, Viewer } from '@shared/ui';
import { platform } from '@platform/index';
import { openAttachment } from '@features/chat/utils';
import { AudioPlayer, RemovedNotice, VideoPlayer } from '@shared/components';
import { StorageConfig } from '@config/storage.config';
import type { FileUIPart, GeneratedImage } from '@shared/types';
import { mediaKind, type MediaKind } from '@shared/utils/chatParts';
import { useObjectUrl } from '@shared/hooks';

const PDF_TYPE = 'application/pdf';

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

/** A PDF in the kit viewer, read into a `blob:` URL while it is open. */
function PdfViewer({ src, title, open, onOpenChange }: { src: string; title: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const objectUrl = useObjectUrl(open ? src : null);
  if (!objectUrl) return null;
  return <Viewer media={{ kind: 'pdf', src: objectUrl, title }} open={open} onOpenChange={onOpenChange} />;
}

/** A document by its name: a PDF opens in the viewer (every platform); any other, on the Mac, in its default app. */
function DocumentChip({ media, name }: { media: ChatMedia; name?: string }) {
  const [open, setOpen] = useState(false);
  const label = name ?? 'file';
  const body = (
    <>
      <Icon icon={FileText} size="sm" tone="muted" className="shrink-0" />
      <Text variant="helper" truncate className="max-w-48">{name}</Text>
    </>
  );
  const pdf = 'url' in media && media.mediaType === PDF_TYPE;
  const opens = pdf || (platform.hasFileManager && 'url' in media);
  const onOpen = () => {
    if (pdf) setOpen(true);
    else if ('url' in media) void openAttachment(media);
  };
  return (
    <Surface variant="subtle" radius="lg" className="my-1 inline-flex">
      {opens ? (
        <Row className="w-auto" aria-label={`Open ${label}`} onClick={onOpen}>{body}</Row>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2">{body}</div>
      )}
      {pdf && <PdfViewer src={media.url} title={label} open={open} onOpenChange={setOpen} />}
    </Surface>
  );
}

interface MediaPartRendererProps {
  media: ChatMedia;
}

export const MediaPartRenderer: React.FC<MediaPartRendererProps> = ({ media }) => {
  const [viewerOpen, setViewerOpen] = useState(false);
  const src = useMediaSrc(media);
  const kind = mediaKind(media.mediaType);
  const name = 'url' in media ? media.filename : media.alt;

  if (src === null) return <RemovedNotice icon={REMOVED_ICON[kind]} label={StorageConfig.removed[kind]} />;
  const handleOpen = () => setViewerOpen(true);

  switch (kind) {
    case 'image':
      return (
        <>
          <div className="my-2 max-w-xs">
            <Thumbnail src={src ?? ''} alt={name || 'AI generated image'} onOpen={handleOpen} shape="natural" />
          </div>
          {src && <Viewer media={{ kind: 'image', src, alt: name || 'AI generated image' }} open={viewerOpen} onOpenChange={setViewerOpen} />}
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
