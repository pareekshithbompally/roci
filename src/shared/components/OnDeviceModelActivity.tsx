/**
 * OnDeviceModelActivity
 *
 * Renders nothing. Bridges on-device model and indexing progress events into
 * ActivityTray rows, with toasts for completion and errors. Download consent
 * is not here: an explicit Download click is consent, and implicit triggers
 * ask through the app-wide `confirm()` (see the rag/voice consent gates).
 *
 * Cache-hit suppression: the embedding service fires rapid download/done/ready
 * events even on cache hits (~100ms total). We debounce on the UI side — only
 * show tray rows if the download phase persists beyond 400ms.
 */

import React, { useEffect } from 'react';
import { onRAGProgress, preloadModel, resetPipeline } from '@extensions/rag';
import type { RAGProgressEvent, IndexingProgressEvent, ExtractionProgressEvent } from '@extensions/rag';
import { DOWNLOADABLE_VOICES, DOWNLOADABLE_VOICE_IDS, loadVoice, onVoiceProgress, resetVoice, voiceTrayId } from '@extensions/voice';
import type { VoiceModelEvent } from '@extensions/voice';
import { activityStore } from '@shared/stores/activityStore';
import type { ActivityItem } from '@shared/stores/activityStore';
import { useToast } from '@shared/contexts/ToastContext';
import { notifyAppEvent } from '@shared/utils/appEvents';

// Only show download toasts if downloading lasts longer than this.
// Cache hits complete in <200ms and should be silent.
const DOWNLOAD_DEBOUNCE_MS = 400;

export const OnDeviceModelActivity: React.FC = () => {
  const { showToast, showErrorWithRetry } = useToast();

  useEffect(() => {
    // ── Per-model download state (rag + voice share this shape) ──
    interface ModelUI {
      trayId: string;
      downloadingLabel: string;
      loadingLabel: string;
      readyToast: string;
      loadError: string;
      retry: () => void;
    }

    function createModelHandlers(ui: ModelUI) {
      let downloadStartedAt = 0;
      let debounceTimer: ReturnType<typeof setTimeout> | undefined;
      let trayVisible = false; // whether we've actually shown a tray row
      let sessionNotified = false; // one "ready" toast per session

      function upsertModelRow(patch: Partial<ActivityItem>) {
        if (activityStore.get(ui.trayId)) {
          activityStore.update(ui.trayId, patch);
        } else {
          activityStore.add({
            id: ui.trayId,
            type: 'download',
            label: ui.downloadingLabel,
            status: 'active',
            percent: null,
            step: null,
            detail: null,
            error: null,
            actions: [],
            ...patch,
          } as ActivityItem);
        }
        trayVisible = true;
      }

      function handleEvent(event: { status: string; percent?: number | null; error?: string }) {
        switch (event.status) {
          case 'downloading': {
            if (downloadStartedAt === 0) {
              downloadStartedAt = Date.now();
            }

            const elapsed = Date.now() - downloadStartedAt;
            const percent = event.percent ?? 0;

            if (elapsed >= DOWNLOAD_DEBOUNCE_MS) {
              upsertModelRow({
                label: ui.downloadingLabel,
                percent: percent > 0 ? percent : null,
              });
            } else if (!debounceTimer) {
              debounceTimer = setTimeout(() => {
                if (downloadStartedAt > 0) {
                  upsertModelRow({ label: ui.downloadingLabel, percent: null });
                }
              }, DOWNLOAD_DEBOUNCE_MS - elapsed);
            }
            break;
          }

          case 'loading':
            if (debounceTimer) {
              clearTimeout(debounceTimer);
              debounceTimer = undefined;
            }

            if (trayVisible) {
              activityStore.update(ui.trayId, {
                label: ui.loadingLabel,
                percent: null,
              });
            }
            break;

          case 'ready':
            if (debounceTimer) {
              clearTimeout(debounceTimer);
              debounceTimer = undefined;
            }

            downloadStartedAt = 0;
            activityStore.remove(ui.trayId);

            if (trayVisible && !sessionNotified) {
              notifyAppEvent({ id: `model:${ui.trayId}`, kind: 'modelDownloads', tone: 'success', inFront: 'toast', title: ui.readyToast, body: 'Download finished.' });
              sessionNotified = true;
            }

            trayVisible = false;
            break;

          case 'error':
            if (debounceTimer) {
              clearTimeout(debounceTimer);
              debounceTimer = undefined;
            }

            downloadStartedAt = 0;
            trayVisible = false;
            activityStore.remove(ui.trayId);

            showErrorWithRetry(event.error || ui.loadError, ui.retry);
            break;
        }
      }

      function dispose() {
        if (debounceTimer) clearTimeout(debounceTimer);
        activityStore.remove(ui.trayId);
      }

      return { handleEvent, dispose };
    }

    const ragHandlers = createModelHandlers({
      trayId: 'rag-model',
      downloadingLabel: 'Downloading embedding model',
      loadingLabel: 'Initializing embedding model',
      readyToast: 'Smart meeting search ready',
      loadError: 'Embedding model failed to load',
      retry: () => {
        resetPipeline();
        preloadModel().catch(() => {});
      },
    });

    const voiceHandlers = Object.fromEntries(DOWNLOADABLE_VOICE_IDS.map((id) => {
      const { label } = DOWNLOADABLE_VOICES[id];
      return [id, createModelHandlers({
        trayId: voiceTrayId(id),
        downloadingLabel: `Downloading ${label}`,
        loadingLabel: `Initializing ${label}`,
        readyToast: `${label} ready to read aloud`,
        loadError: `${label} failed to load`,
        retry: () => {
          resetVoice(id);
          loadVoice(id).catch(() => {});
        },
      })];
    }));

    function handleModelEvent(event: RAGProgressEvent & { kind: 'model' }) {
      ragHandlers.handleEvent(event);
    }

    function handleVoiceEvent(event: VoiceModelEvent) {
      voiceHandlers[event.voice]?.handleEvent(event);
    }

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
          console.error(`[OnDeviceModelActivity] ${label} failed:`, event.error);
          showToast(`Couldn’t finish ${label.toLowerCase()}`, 'error');
          break;
      }
    }

    function handleExtractionEvent(event: ExtractionProgressEvent) {
      switch (event.status) {
        case 'started':
          if (event.total && event.total > 0) {
            activityStore.add({
              id: 'rag-extraction',
              type: 'indexing',
              label: 'Extracting entities',
              status: 'active',
              percent: null,
              step: { current: 0, total: event.total },
              detail: null,
              error: null,
              actions: [],
            });
          }
          break;

        case 'progress':
          if (event.current && event.total) {
            const percent = Math.round((event.current / event.total) * 100);
            const title = event.currentTitle ?? null;

            if (activityStore.get('rag-extraction')) {
              activityStore.update('rag-extraction', {
                step: { current: event.current, total: event.total },
                percent,
                detail: title,
              });
            } else {
              activityStore.add({
                id: 'rag-extraction',
                type: 'indexing',
                label: 'Extracting entities',
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
          if (activityStore.get('rag-extraction')) {
            activityStore.remove('rag-extraction');
          }
          break;

        case 'error':
          activityStore.remove('rag-extraction');
          break;
      }
    }

    const unsubscribe = onRAGProgress((event: RAGProgressEvent) => {
      if (event.kind === 'model') {
        handleModelEvent(event);
      } else if (event.kind === 'indexing') {
        handleIndexingEvent(event);
      } else if (event.kind === 'extraction') {
        handleExtractionEvent(event);
      }
    });

    const unsubscribeVoice = onVoiceProgress(handleVoiceEvent);

    return () => {
      unsubscribe();
      unsubscribeVoice();
      ragHandlers.dispose();
      Object.values(voiceHandlers).forEach((handlers) => handlers.dispose());
      activityStore.remove('rag-indexing-meetings');
      activityStore.remove('rag-indexing-chats');
      activityStore.remove('rag-extraction');
    };
  }, [showToast, showErrorWithRetry]);

  return null;
};
