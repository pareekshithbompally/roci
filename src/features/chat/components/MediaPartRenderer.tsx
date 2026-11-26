/** Renders a chat's media: attached files and tool-made images (an image or a PDF opens in the kit Viewer, audio and video play
 *  in the shared players, any other document opens in its default app on the Mac); a removed file shows as removed. */

import React, { useState } from 'react';
import { FileX, ImageOff, VideoOff, VolumeX, type LucideIcon } from 'lucide-react';
import { Button, FileTypeIcon, Row, showToast, Surface, Text, Thumbnail, Viewer } from '@shared/ui';
import { platform } from '@platform/index';
import { openAttachment } from '@features/chat/utils';
import { AudioPlayer, RemovedNotice, VideoPlayer } from '@shared/components';
import { StorageConfig } from '@config/storage.config';
import { ATTACHMENT_COPY } from '@config/chat.config';
import { attachmentInput, isSearchableDocument, mediaKind, type MediaKind } from '@shared/utils/chatParts';
import type { FileUIPart } from '@shared/types';
import { useKeepInKnowledge } from '@shared/hooks/useKeepInKnowledge';
import { useObjectUrl } from '@shared/hooks';
import { keptPathOf, useMediaSrc, type ChatMedia } from '@features/chat/hooks/useMediaSrc';

export type { ChatMedia };

const REMOVED_ICON: Record<MediaKind, LucideIcon> = { image: ImageOff, audio: VolumeX, video: VideoOff, document: FileX };

/** Which media this is, for the playback session: a kept file by its path, an attachment by its URL. */
const mediaId = (media: ChatMedia): string => keptPathOf(media) ?? ('url' in media ? media.url : '');

/** A PDF in the kit viewer, read into a `blob:` URL while it is open; one that can't be read closes and says so. */
function PdfViewer({ src, title, open, onOpenChange }: { src: string; title: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const objectUrl = useObjectUrl(open ? src : null, (error) => {
    console.error('[MediaPartRenderer] Reading the PDF failed:', title, error);
    onOpenChange(false);
    showToast(ATTACHMENT_COPY.openFailed(title), 'error');
  });
  if (!objectUrl) return null;
  return <Viewer media={{ kind: 'pdf', src: objectUrl, title }} open={open} onOpenChange={onOpenChange} />;
}

/** Keep in Knowledge for a document attached here, until it is in the library. */
function KeepInKnowledge({ part }: { part: FileUIPart }) {
  const { kept, keep } = useKeepInKnowledge(part);
  if (kept) return null;
  return <Button variant="ghost" size="inline" className="mr-3" onClick={keep}>{ATTACHMENT_COPY.keep}</Button>;
}

/** A document by its name: a PDF opens in the viewer (every platform); any other, on the Mac, in its default app. One
 *  attached here can be kept in Knowledge. */
function DocumentChip({ media, src, name }: { media: ChatMedia; src?: string; name?: string }) {
  const [open, setOpen] = useState(false);
  const label = name ?? 'file';
  const body = (
    <>
      <FileTypeIcon name={label} />
      <Text variant="helper" truncate className="max-w-48">{name}</Text>
    </>
  );
  const pdf = 'url' in media && attachmentInput(media.mediaType, media.filename) === 'pdf';
  const opens = !!src && (pdf || (platform.hasFileManager && 'url' in media));
  const onOpen = () => {
    if (pdf) setOpen(true);
    else if (src) void openAttachment(label, src);
  };
  return (
    <Surface variant="subtle" radius="lg" className="my-1 inline-flex items-center">
      {opens ? (
        <Row className="w-auto" aria-label={`Open ${label}`} onClick={onOpen}>{body}</Row>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2">{body}</div>
      )}
      {'url' in media && isSearchableDocument(media) && <KeepInKnowledge part={media} />}
      {pdf && src && <PdfViewer src={src} title={label} open={open} onOpenChange={setOpen} />}
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
      return <DocumentChip media={media} src={src} name={name} />;
  }
};

export default MediaPartRenderer;
