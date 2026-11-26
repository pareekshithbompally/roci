/** Gallery: what Roci makes, by folder. Images: a timeline of every image made in chat (days newest first, rounded tiles; one
 *  opens full size with its prompt, model and time, and the chat it came from). Audio: replies saved from Read Aloud, each
 *  with its words and a player. Video: what a video model makes (none yet). Documents live in Knowledge, never here. */

import React, { useState } from 'react';
import { formatClockTime, formatCount, formatDateTime, formatDuration } from '@shared/utils/formatters';
import { Images, MessageSquare, Trash2 } from 'lucide-react';
import { Button, ChoiceControl, Icon, IconButton, Surface, Text, Thumbnail, ViewHeader, ViewScroll, Viewer } from '@shared/ui';
import { AudioPlayer, ModelBadge, ScreenState, VideoPlayer } from '@shared/components';
import { openChat } from '@features/chat';
import { imagesService, mediaService, type GalleryMedia, type GalleryMediaKind } from '@services/storage';
import type { GalleryImage } from '@services/storage/images.service';
import { confirmDelete } from '@shared/stores/confirmStore';
import { LAYOUT } from '@config/layout.config';
import { GALLERY_CONFIG } from '@config/gallery.config';
import { useGalleryCount, useGalleryFolder, useRemoveGalleryItem, type FolderKind } from '@features/gallery/hooks/useGalleryFolder';
import { useSentinel } from '@shared/hooks/useSentinel';

/** Under the full-size image: what was asked for, how it was made, and the way back to its chat. */
const ImageCaption: React.FC<{ image: GalleryImage; onOpenChat: (chatId: string) => void }> = ({ image, onOpenChat }) => {
  const { meta, chatId } = image;
  const facts = [meta?.aspectRatio, formatDateTime(image.createdAt)].filter(Boolean).join(' · ');
  return (
    <Surface variant="card" radius="xl" className="space-y-2 p-4">
      {meta && <Text as="p" variant="body" className="line-clamp-3">{meta.prompt}</Text>}
      <div className="flex items-center gap-3">
        {meta && <ModelBadge provider={meta.provider} model={meta.model} />}
        <Text variant="helper" tone="muted" truncate className="flex-1">{facts}</Text>
        {chatId && (
          <Button variant="outline" size="sm" onClick={() => onOpenChat(chatId)}>
            <Icon icon={MessageSquare} size="xs" />
            {GALLERY_CONFIG.openChat}
          </Button>
        )}
      </div>
    </Surface>
  );
};

/** A folder's days under their labels, newest first, loading older ones as the list nears its end; loading, failed and empty
 *  fill the view (centred there), not the scroll area. */
function FolderDays<T extends { id: string; createdAt: number }>({ folder, empty, children }: {
  folder: ReturnType<typeof useGalleryFolder<T>>;
  empty: string;
  children: (items: T[]) => React.ReactNode;
}) {
  const { days, isLoading, error, hasMore, loadingMore, loadMore } = folder;
  const canLoadMore = hasMore && !loadingMore;
  const sentinelRef = useSentinel({ onIntersect: loadMore, enabled: canLoadMore });
  return (
    <ScreenState
      loading={isLoading}
      error={error && { cause: error, title: GALLERY_CONFIG.loadFailed }}
      empty={days.length === 0 && { icon: Images, message: empty }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <ViewScroll className={`space-y-6 pb-4 ${LAYOUT.listGutter}`}>
        {days.map((day) => (
          <section key={day.label} className="space-y-2">
            <Text as="h2" variant="label" tone="muted">{day.label}</Text>
            {children(day.items)}
          </section>
        ))}
        {canLoadMore && <div ref={sentinelRef} className="h-1" aria-hidden="true" />}
      </ViewScroll>
    </ScreenState>
  );
}

/** Images: the day-by-day grid; a tile opens the image full size. */
const ImagesFolder: React.FC<{ empty: string }> = ({ empty }) => {
  const folder = useGalleryFolder('image', imagesService.imagesPage);
  const [open, setOpen] = useState<GalleryImage | null>(null);

  const goToChat = (sessionId: string) => {
    setOpen(null);
    openChat(sessionId);
  };

  return (
    <>
      <FolderDays folder={folder} empty={empty}>
        {(images) => (
          <div className={GALLERY_CONFIG.grid}>
            {images.map((image) => (
              <Thumbnail key={image.appPath} src={image.thumbUrl} alt={image.meta?.prompt ?? GALLERY_CONFIG.title} onOpen={() => setOpen(image)} />
            ))}
          </div>
        )}
      </FolderDays>
      {open && (
        <Viewer
          media={{ kind: 'image', src: open.url, alt: open.meta?.prompt ?? GALLERY_CONFIG.title }}
          open
          onOpenChange={(next) => !next && setOpen(null)}
          caption={<ImageCaption image={open} onOpenChat={goToChat} />}
        />
      )}
    </>
  );
};

/** One kept sound or video: its words, its player, when and how long; Delete. */
const MediaCard: React.FC<{ item: GalleryMedia; kind: GalleryMediaKind; label: string; onDelete: () => void }> = ({ item, kind, label, onDelete }) => {
  const title = item.text ?? label;
  const facts = [formatClockTime(item.createdAt), item.durationSeconds !== null && formatDuration(item.durationSeconds)].filter(Boolean).join(' · ');
  return (
    <Surface variant="card" radius="xl" className="space-y-2 p-4">
      <div className="flex items-start gap-2">
        <Text as="p" variant="body" className="line-clamp-2 min-w-0 flex-1">{title}</Text>
        <IconButton icon={Trash2} label={`Delete ${GALLERY_CONFIG.deleteNoun[kind]}`} size="sm" variant="dangerGhost" onClick={onDelete} />
      </div>
      {kind === 'speech'
        ? <AudioPlayer session={{ id: item.appPath, src: item.url, title, duration: item.durationSeconds ?? 0 }} />
        : <VideoPlayer src={item.url} label={title} />}
      <Text variant="helper" tone="muted">{facts}</Text>
    </Surface>
  );
};

/** Audio or Video: what was kept, under its day, newest first. */
const MediaFolder: React.FC<{ kind: GalleryMediaKind; label: string; empty: string }> = ({ kind, label, empty }) => {
  const folder = useGalleryFolder(kind, (before, limit) => mediaService.page(kind, before, limit));
  const remove = useRemoveGalleryItem(kind);
  const deleteItem = async (id: string) => {
    if (await confirmDelete(GALLERY_CONFIG.deleteNoun[kind])) remove(id);
  };
  return (
    <FolderDays folder={folder} empty={empty}>
      {(items) => items.map((item) => <MediaCard key={item.id} item={item} kind={kind} label={label} onDelete={() => void deleteItem(item.id)} />)}
    </FolderDays>
  );
};

export const GalleryView: React.FC = () => {
  const [kind, setKind] = useState<FolderKind>(GALLERY_CONFIG.folders[0].kind);
  const folder = GALLERY_CONFIG.folders.find((f) => f.kind === kind) ?? GALLERY_CONFIG.folders[0];
  const count = useGalleryCount(kind);
  const items = GALLERY_CONFIG.folders.map((f) => ({ value: f.kind, label: f.label }));

  return (
    <div className="flex h-full flex-col">
      <ViewHeader title={GALLERY_CONFIG.title} detail={count > 0 && formatCount(count, folder.noun)}>
        <ChoiceControl items={items} value={kind} onValueChange={setKind} label={GALLERY_CONFIG.foldersLabel} />
      </ViewHeader>
      {folder.kind === 'image'
        ? <ImagesFolder empty={folder.empty} />
        : <MediaFolder key={folder.kind} kind={folder.kind} label={folder.label} empty={folder.empty} />}
    </div>
  );
};
