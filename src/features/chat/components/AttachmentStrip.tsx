/** The composer's pending attachments: each by its thumbnail or kind, with its name and a remove button; an image opens
 *  full size in the kit Viewer. A document says how it goes to the model: Search (looked up in when needed, the default) or
 *  Send whole, with what that costs in tokens. */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Film, Image as ImageIcon, Music, X, type LucideIcon } from 'lucide-react';
import { Button, Icon, IconButton, Surface, Text, Thumbnail, Viewer } from '@shared/ui';
import { Menu } from '@shared/components';
import type { FileUIPart } from '@shared/types';
import { isSearchableDocument, mediaKind, sendsWhole, type MediaKind } from '@shared/utils/chatParts';
import { formatTokens } from '@shared/utils/formatters';
import { queryKeys } from '@shared/query/queryKeys';
import { documentPages } from '@extensions/rag';
import { tokensIn } from '@extensions/tool-orchestrator/contextFit';
import { ATTACHMENT_COPY } from '@config/chat.config';
import { useMediaSrc } from '@features/chat/hooks/useMediaSrc';
import { useChatStore } from '@features/chat/stores/chatStore';

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

const { send: SEND } = ATTACHMENT_COPY;

/** How a pending document goes to the model, chosen from a menu: Search (the default) or Send whole with its token count
 *  (read from the file; a count that can't be read is left off). */
function SendChoice({ part, index }: { part: FileUIPart; index: number }) {
  const setSendWhole = useChatStore((s) => s.setAttachmentSendWhole);
  const { data: tokens } = useQuery({
    queryKey: queryKeys.documentPages(part.url),
    queryFn: () => documentPages(part.url),
    select: (document) => tokensIn(document.pages.join('\n')),
    staleTime: Infinity,
  });
  const whole = sendsWhole(part);
  const wholeLabel = tokens === undefined ? SEND.whole : SEND.wholeTokens(formatTokens(tokens));
  return (
    <Menu
      label={SEND.label}
      align="start"
      trigger={<Button variant="ghost" size="inline">{whole ? SEND.whole : SEND.search}</Button>}
      items={[
        { type: 'check', label: SEND.search, checked: !whole, onSelect: () => setSendWhole(index, false) },
        { type: 'check', label: wholeLabel, checked: whole, onSelect: () => setSendWhole(index, true) },
      ]}
    />
  );
}

function AttachmentChip({ part, index, onRemove }: { part: FileUIPart; index: number; onRemove?: () => void }) {
  const kind = mediaKind(part.mediaType);
  const name = part.filename || UNNAMED[kind];
  return (
    <Surface variant="inset" radius="md" className="flex items-center gap-1.5 px-2 py-1">
      {kind === 'image' ? <ImageTile part={part} name={name} /> : <Icon icon={KIND_ICON[kind]} size="xs" />}
      <Text variant="helper" tone="muted" truncate className="max-w-32">{name}</Text>
      {isSearchableDocument(part) && <SendChoice part={part} index={index} />}
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
        <AttachmentChip key={index} part={part} index={index} onRemove={onRemove && (() => onRemove(index))} />
      ))}
    </div>
  );
};
