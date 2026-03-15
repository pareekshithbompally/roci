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
import { Download, Brain } from 'lucide-react';
import { onConsentNeeded } from '@extensions/rag';
import { onRAGProgress, preloadModel, resetPipeline } from '@extensions/rag';
import type { RAGProgressEvent, IndexingProgressEvent } from '@extensions/rag';
import {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@shared/ui';
import { SURFACE, BORDER, TEXT, COMPONENT, RADIUS, SHADOW } from '@config/theme.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { activityStore } from '@shared/stores/activityStore';
import type { ActivityItem } from '@shared/stores/activityStore';
import { useToast } from '@shared/contexts/ToastContext';

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
      switch (event.status) {
        case 'started':
          // Single-meeting gate: no tray row for total <= 1
          if (event.total && event.total > 1) {
            activityStore.add({
              id: 'rag-indexing',
              type: 'indexing',
              label: 'Indexing meetings',
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
          if (activityStore.get('rag-indexing') && event.current && event.total) {
            const percent = Math.round((event.current / event.total) * 100);
            activityStore.update('rag-indexing', {
              step: { current: event.current, total: event.total },
              percent,
              detail: (event as any).title || null,
            });
          }
          break;

        case 'complete':
          if (activityStore.get('rag-indexing')) {
            activityStore.remove('rag-indexing');
            if (event.current && event.current > 0) {
              showToast(
                `Indexed ${event.current} meeting${event.current > 1 ? 's' : ''}`,
                'success',
              );
            }
          }
          break;

        case 'error':
          activityStore.remove('rag-indexing');
          showErrorWithRetry(
            event.error || 'Meeting indexing failed',
            () => {
              // Retry will be triggered by the next search or app launch warm-up
            },
          );
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
      }
    });

    return () => {
      unsubscribe();
      if (debounceTimer) clearTimeout(debounceTimer);
      activityStore.remove('rag-model');
      activityStore.remove('rag-indexing');
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
        <AlertDialogContent className="max-w-md overflow-hidden">
          {/* Icon + Title — inline row (matches DeleteConfirmModal) */}
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-full ${SURFACE.infoCallout} flex items-center justify-center`}>
              <Brain className={`w-5 h-5 ${TEXT.link}`} />
            </div>
            <AlertDialogTitle>
              Enable Smart Meeting Search?
            </AlertDialogTitle>
          </div>

          {/* Description — aligned under title */}
          <AlertDialogDescription className="pl-[52px] mb-4">
            To automatically find relevant meetings for your questions, Kasset needs to download a small AI model that runs entirely on your device.
          </AlertDialogDescription>

          {/* Feature list — aligned with description */}
          <div className={`ml-[52px] ${SURFACE.subtle} border ${BORDER.default} rounded-xl p-3 mb-6 space-y-1.5`}>
            <div className={`flex items-center gap-2 ${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted}`}>
              <Download className="w-3.5 h-3.5 flex-shrink-0" />
              <span>One-time download of ~23 MB (cached after)</span>
            </div>
            <div className={`flex items-center gap-2 ${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted}`}>
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Runs 100% locally — no data leaves your device</span>
            </div>
            <div className={`flex items-center gap-2 ${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted}`}>
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>You can still chat normally without this</span>
            </div>
          </div>

          {/* Actions — right-aligned (matches DeleteConfirmModal) */}
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel asChild>
              <button className={`px-4 py-2.5 text-sm font-semibold ${COMPONENT.secondaryButton} rounded-xl`}>
                Not Now
              </button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <button
                onClick={handleAccept}
                className={`px-4 py-2.5 text-sm font-semibold ${COMPONENT.accentButton} rounded-xl ${SHADOW.float}`}
              >
                Download Model
              </button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialog>
  );
};

export default ModelDownloadModal;
