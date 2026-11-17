/** Renders nothing: bridges search indexing progress into ActivityTray rows and an error toast. */

import React, { useEffect } from 'react';
import { onRAGProgress } from '@extensions/rag';
import type { IndexingProgressEvent } from '@extensions/rag';
import { activityStore } from '@shared/stores/activityStore';
import { useToast } from '@shared/contexts/ToastContext';

export const SearchIndexActivity: React.FC = () => {
  const { showToast } = useToast();

  useEffect(() => {
    function handleIndexingEvent(event: IndexingProgressEvent) {
      // Derive whether this is chat or meeting indexing from the title prefix
      const isChat = event.currentTitle?.startsWith('Chat:') ?? false;
      const activityId = isChat ? 'rag-indexing-chats' : 'rag-indexing-meetings';
      const label = isChat ? 'Indexing chats' : 'Indexing meetings';

      switch (event.status) {
        case 'started':
          if (event.total && event.total > 1) {
            activityStore.add({
              id: activityId,
              type: 'indexing',
              label,
              status: 'active',
              percent: null,
              step: { current: 0, total: event.total },
              detail: event.currentTitle ?? null,
              error: null,
              actions: [],
            });
          }
          break;

        case 'progress':
          if (event.current && event.total) {
            const percent = Math.round((event.current / event.total) * 100);
            const title = event.currentTitle ?? null;

            if (activityStore.get(activityId)) {
              activityStore.update(activityId, {
                label,
                step: { current: event.current, total: event.total },
                percent,
                detail: title,
              });
            } else {
              activityStore.add({
                id: activityId,
                type: 'indexing',
                label,
                status: 'active',
                percent,
                step: { current: event.current, total: event.total },
                detail: title,
                error: null,
                actions: [],
              });
            }
          }
          break;

        case 'complete':
          if (activityStore.get(activityId)) {
            activityStore.remove(activityId);
          }
          break;

        case 'error':
          activityStore.remove(activityId);
          console.error(`[SearchIndexActivity] ${label} failed:`, event.error);
          showToast(`Couldn’t finish ${label.toLowerCase()}`, 'error');
          break;
      }
    }

    const unsubscribe = onRAGProgress(handleIndexingEvent);

    return () => {
      unsubscribe();
      activityStore.remove('rag-indexing-meetings');
      activityStore.remove('rag-indexing-chats');
    };
  }, [showToast]);

  return null;
};
