/** Gallery: a timeline of every image made in chat — days newest first, rounded tiles; one opens full size with its
 *  prompt, model and time, and the chat it came from. */

import React, { useState } from 'react';
import { Images, MessageSquare } from 'lucide-react';
import { Button, Icon, Lightbox, Surface, Text, Thumbnail, TitlebarSpacer } from '@shared/ui';
import { EmptyState } from '@shared/components';
import { openChat } from '@features/chat';
import type { GalleryImage } from '@services/storage/images.service';
import { LAYOUT } from '@config/layout.config';
import { GALLERY_CONFIG } from '@config/gallery.config';
import { useGallery } from '@features/gallery/hooks/useGallery';

const timeOf = (createdAt: number) => new Date(createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Under the full-size image: what was asked for, how it was made, and the way back to its chat. */
const ImageCaption: React.FC<{ image: GalleryImage; onOpenChat: (sessionId: string) => void }> = ({ image, onOpenChat }) => {
  const { details } = image;
  if (!details) return null;
  const sessionId = details.sessionId;
  return (
    <Surface variant="card" radius="xl" edge="all" className="space-y-2 p-4">
      <Text as="p" variant="body" className="line-clamp-3">{details.prompt}</Text>
      <div className="flex items-center gap-3">
        <Text variant="helper" tone="muted" truncate className="flex-1">
          {details.model} · {details.aspectRatio} · {timeOf(details.createdAt)}
        </Text>
        {sessionId && (
          <Button variant="outline" size="sm" onClick={() => onOpenChat(sessionId)}>
            <Icon icon={MessageSquare} size="xs" />
            {GALLERY_CONFIG.openChat}
          </Button>
        )}
      </div>
    </Surface>
  );
};

export const GalleryView: React.FC = () => {
  const { days, count, isLoading } = useGallery();
  const [open, setOpen] = useState<GalleryImage | null>(null);

  const goToChat = (sessionId: string) => {
    setOpen(null);
    openChat(sessionId);
  };

  return (
    <div className="flex h-full flex-col">
      <TitlebarSpacer />
      <Surface as="header" edge="bottom" className={`shrink-0 ${LAYOUT.listGutter} pt-2 pb-3`}>
        <Text as="h1" variant="pageTitle">{GALLERY_CONFIG.title}</Text>
        {count > 0 && <Text as="p" variant="helper" tone="muted">{count} {count === 1 ? 'image' : 'images'}</Text>}
      </Surface>

      <div className={`flex-1 overflow-y-auto custom-scrollbar ${LAYOUT.listGutter} py-4`}>
        {!isLoading && count === 0 ? (
          <EmptyState icon={Images} message={GALLERY_CONFIG.empty} />
        ) : (
          <div className="space-y-6">
            {days.map((day) => (
              <section key={day.label} className="space-y-2">
                <Text as="h2" variant="label" tone="muted">{day.label}</Text>
                <div className={GALLERY_CONFIG.grid}>
                  {day.images.map((image) => (
                    <Thumbnail
                      key={image.appPath}
                      src={image.thumbUrl}
                      alt={image.details?.prompt ?? GALLERY_CONFIG.title}
                      onOpen={() => setOpen(image)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {open && (
        <Lightbox
          src={open.url}
          alt={open.details?.prompt ?? GALLERY_CONFIG.title}
          open
          onOpenChange={(next) => !next && setOpen(null)}
          caption={<ImageCaption image={open} onOpenChat={goToChat} />}
        />
      )}
    </div>
  );
};
