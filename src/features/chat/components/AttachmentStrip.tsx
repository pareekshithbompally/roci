/** The composer's pending attachments: each by its thumbnail or kind, with its name and a remove button; an image opens
 *  full size in the kit Viewer. */

import React, { useState } from 'react';
import { FileText, Film, Image as ImageIcon, Music, X, type LucideIcon } from 'lucide-react';
import { Icon, IconButton, Surface, Text, Thumbnail, Viewer } from '@shared/ui';
import type { FileUIPart } from '@shared/types';
import { mediaKind, type MediaKind } from '@shared/utils/chatParts';
import { useMediaSrc } from '@features/chat/hooks/useMediaSrc';

/** What an attachment without a name is called, by its kind. */
const UNNAMED: Record<MediaKind, string> = { image: 'Image', audio: 'Audio', video: 'Video', document: 'File' };

const KIND_ICON: Record<MediaKind, LucideIcon> = { image: ImageIcon, audio: Music, video: Film, document: FileText };

/** An image attachment's tile (its kept file, once its URL is in); it opens the image full size. */
function ImageTile({ part, name }: { part: FileUIPart; name: string }) {
  const [open, setOpen] = useState(false);
  const src = useMediaSrc(part);
  if (!src) return null;
  return (
    <>
      <div className="w-8 shrink-0">
        <Thumbnail src={src} alt={name} onOpen={() => setOpen(true)} />
      </div>
      <Viewer media={{ kind: 'image', src, alt: name }} open={open} onOpenChange={setOpen} />
    </>
  );
}

function AttachmentChip({ part, onRemove }: { part: FileUIPart; onRemove?: () => void }) {
  const kind = mediaKind(part.mediaType);
  const name = part.filename || UNNAMED[kind];
  return (
    <Surface variant="inset" radius="md" className="flex items-center gap-1.5 px-2 py-1">
      {kind === 'image' ? <ImageTile part={part} name={name} /> : <Icon icon={KIND_ICON[kind]} size="xs" />}
      <Text variant="helper" tone="muted" truncate className="max-w-32">{name}</Text>
      {onRemove && <IconButton icon={X} label="Remove attachment" size="sm" onClick={onRemove} />}
    </Surface>
  );
}

interface AttachmentStripProps {
  attachments: FileUIPart[];
  /** Removes the attachment at `index`; without it the chips can't be removed. */
  onRemove?: (index: number) => void;
}

export const AttachmentStrip: React.FC<AttachmentStripProps> = ({ attachments, onRemove }) => {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-3 pt-2">
      {attachments.map((part, index) => (
        <AttachmentChip key={index} part={part} onRemove={onRemove && (() => onRemove(index))} />
      ))}
    </div>
  );
};
