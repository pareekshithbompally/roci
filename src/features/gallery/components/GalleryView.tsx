/** Gallery: a timeline of every image made in chat — days newest first, rounded tiles; one opens full size with its
 *  prompt, model and time, and the chat it came from. */

import React, { useState } from 'react';
import { formatDateTime } from '@shared/utils/formatters';
import { Images, MessageSquare } from 'lucide-react';
import { Button, Icon, Lightbox, Surface, Text, Thumbnail, ViewHeader, ViewScroll } from '@shared/ui';
import { ModelBadge, ScreenState } from '@shared/components';
import { openChat } from '@features/chat';
import type { GalleryImage } from '@services/storage/images.service';
import { LAYOUT } from '@config/layout.config';
import { GALLERY_CONFIG } from '@config/gallery.config';
import { useGallery } from '@features/gallery/hooks/useGallery';
import { useSentinel } from '@shared/hooks/useSentinel';


/** Under the full-size image: what was asked for, how it was made, and the way back to its chat. */
const ImageCaption: React.FC<{ image: GalleryImage; onOpenChat: (chatId: string) => void }> = ({ image, onOpenChat }) => {
  const { meta, chatId } = image;
  const facts = [meta?.aspectRatio, formatDateTime(image.createdAt)].filter(Boolean).join(' · ');
  return (
    <Surface variant="card" radius="xl" edge="all" className="space-y-2 p-4">
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

export const GalleryView: React.FC = () => {
  const { days, count, isLoading, hasMore, loadingMore, loadMore } = useGallery();
  const canLoadMore = hasMore && !loadingMore;
  const sentinelRef = useSentinel({ onIntersect: loadMore, enabled: canLoadMore });
  const [open, setOpen] = useState<GalleryImage | null>(null);

  const goToChat = (sessionId: string) => {
    setOpen(null);
    openChat(sessionId);
  };

  return (
    <div className="flex h-full flex-col">
      <ViewHeader title={GALLERY_CONFIG.title} detail={count > 0 && `${count} ${count === 1 ? 'image' : 'images'}`} />

      {/* Loading and empty fill the view (centred there), not the scroll area. */}
      <ScreenState
        loading={isLoading}
        empty={days.length === 0 && { icon: Images, message: GALLERY_CONFIG.empty }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <ViewScroll className={`space-y-6 pb-4 ${LAYOUT.listGutter}`}>
          {days.map((day) => (
            <section key={day.label} className="space-y-2">
              <Text as="h2" variant="label" tone="muted">{day.label}</Text>
              <div className={GALLERY_CONFIG.grid}>
                {day.images.map((image) => (
                  <Thumbnail
                    key={image.appPath}
                    src={image.thumbUrl}
                    alt={image.meta?.prompt ?? GALLERY_CONFIG.title}
                    onOpen={() => setOpen(image)}
                  />
                ))}
              </div>
            </section>
          ))}
          {canLoadMore && <div ref={sentinelRef} className="h-1" aria-hidden="true" />}
        </ViewScroll>
      </ScreenState>

      {open && (
        <Lightbox
          src={open.url}
          alt={open.meta?.prompt ?? GALLERY_CONFIG.title}
          open
          onOpenChange={(next) => !next && setOpen(null)}
          caption={<ImageCaption image={open} onOpenChat={goToChat} />}
        />
      )}
    </div>
  );
};
