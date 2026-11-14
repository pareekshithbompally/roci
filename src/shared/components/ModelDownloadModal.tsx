/**
 * ModelDownloadModal Component
 *
 * Two-tier UX for the RAG embedding model:
 *   1. FIRST TIME: Blocking consent modal — user opts in to download.
 *   2. SUBSEQUENT: ActivityTray rows for progress, toasts for completion/errors.
 *
 * After the user grants consent once, the modal never appears again.
 * All progress feedback (cached model reload, re-download after cache eviction)
 * is shown as ActivityTray rows that don't interrupt the user's workflow.
 *
 * Cache-hit suppression: the embedding service fires rapid download/done/ready
 * events even on cache hits (~100ms total). We debounce on the UI side — only
 * show tray rows if the download phase persists beyond 400ms.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Download, Lock, Zap } from 'lucide-react';
import { onConsentNeeded } from '@extensions/rag';
import { onRAGProgress, preloadModel, resetPipeline } from '@extensions/rag';
import type { RAGProgressEvent, IndexingProgressEvent, ExtractionProgressEvent } from '@extensions/rag';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogOverlay, AlertDialogPortal, AlertDialogTitle, Button, Icon, Text } from '@shared/ui';
import { activityStore } from '@shared/stores/activityStore';
import type { ActivityItem } from '@shared/stores/activityStore';
import { useToast } from '@shared/contexts/ToastContext';

const CONSENT_POINTS = [
  { icon: Download, text: 'One-time download of ~23 MB (cached after)' },
  { icon: Lock, text: 'Runs 100% locally — no data leaves your device' },
  { icon: Zap, text: 'You can still chat normally without this' },
];

// Only show download toasts if downloading lasts longer than this.
// Cache hits complete in <200ms and should be silent.
const DOWNLOAD_DEBOUNCE_MS = 400;

export const ModelDownloadModal: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [resolver, setResolver] = useState<((granted: boolean) => void) | null>(null);
  const { showToast, showErrorWithRetry } = useToast();

  // Subscribe to consent requests — only fires when hasConsent() is false
  useEffect(() => {
    const unsubscribe = onConsentNeeded((resolve) => {
      setResolver(() => resolve);
      setVisible(true);
    });
    return unsubscribe;
  }, []);

  // Subscribe to progress events — show tray rows (not toasts) after consent.
  // Uses a ref to avoid re-subscribing on every state change.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    // ── Model download state ──
    let downloadStartedAt = 0;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let trayVisible = false; // whether we've actually shown a tray row
    let sessionNotified = false; // one "ready" toast per session

    function upsertModelRow(patch: Partial<ActivityItem>) {
      if (activityStore.get('rag-model')) {
        activityStore.update('rag-model', patch);
      } else {
        activityStore.add({
          id: 'rag-model',
          type: 'download',
          label: 'Downloading embedding model',
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

    function handleModelEvent(event: RAGProgressEvent & { kind: 'model' }) {
      switch (event.status) {
        case 'downloading': {
          if (downloadStartedAt === 0) {
            downloadStartedAt = Date.now();
          }

          const elapsed = Date.now() - downloadStartedAt;
          const percent = event.percent ?? 0;

          if (elapsed >= DOWNLOAD_DEBOUNCE_MS) {
            upsertModelRow({
              label: 'Downloading embedding model',
              percent: percent > 0 ? percent : null,
            });
          } else if (!debounceTimer) {
            debounceTimer = setTimeout(() => {
              if (downloadStartedAt > 0) {
                upsertModelRow({ label: 'Downloading embedding model', percent: null });
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
            activityStore.update('rag-model', {
              label: 'Initializing embedding model',
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
          activityStore.remove('rag-model');

          if (trayVisible && !sessionNotified) {
            showToast('Smart meeting search ready', 'success');
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
          activityStore.remove('rag-model');

          showErrorWithRetry(
            event.error || 'Embedding model failed to load',
            () => {
              resetPipeline();
              preloadModel().catch(() => {});
            },
          );
          break;
      }
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
          showErrorWithRetry(
            event.error || `${label} failed`,
            () => {},
          );
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
      // Don't show tray rows while the consent modal is up
      if (visibleRef.current) return;

      if (event.kind === 'model') {
        handleModelEvent(event);
      } else if (event.kind === 'indexing') {
        handleIndexingEvent(event);
      } else if (event.kind === 'extraction') {
        handleExtractionEvent(event);
      }
    });

    return () => {
      unsubscribe();
      if (debounceTimer) clearTimeout(debounceTimer);
      activityStore.remove('rag-model');
      activityStore.remove('rag-indexing-meetings');
      activityStore.remove('rag-indexing-chats');
      activityStore.remove('rag-extraction');
    };
  }, []); // No dependencies — uses refs for reactive state

  const handleAccept = useCallback(() => {
    resolver?.(true);
    setResolver(null);
    setVisible(false);
  }, [resolver]);

  const handleDecline = useCallback(() => {
    resolver?.(false);
    setResolver(null);
    setVisible(false);
  }, [resolver]);

  return (
    <AlertDialog
      open={visible}
      onOpenChange={(open) => { if (!open) handleDecline(); }}
    >
      <AlertDialogPortal>
        <AlertDialogOverlay />
        <AlertDialogContent className="max-w-sm overflow-hidden p-5">
          <AlertDialogTitle className="mb-1.5">Enable Smart Meeting Search?</AlertDialogTitle>

          <AlertDialogDescription className="mb-4">
            To find relevant meetings for your questions, Kasset needs a small AI model that runs entirely on your device.
          </AlertDialogDescription>

          {/* Feature list */}
          <div className="bg-layer-1 rounded-lg p-3 mb-5 space-y-1.5">
            {CONSENT_POINTS.map(({ icon, text }) => (
              <Text key={text} as="div" variant="helper" tone="muted" className="flex items-center gap-2">
                <Icon icon={icon} size="sm" className="shrink-0" />
                {text}
              </Text>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2.5 justify-end">
            <AlertDialogCancel asChild>
              <Button variant="outline" size="md">Not Now</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="accent" size="md" onClick={handleAccept}>
                Download Model
              </Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialog>
  );
};

