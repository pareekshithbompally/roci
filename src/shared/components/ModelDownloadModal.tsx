/**
 * ModelDownloadModal Component
 *
 * Two-tier UX for the RAG embedding model:
 *   1. FIRST TIME: Blocking consent modal — user opts in to download.
 *   2. SUBSEQUENT: Nonblocking Sonner toasts for download/load/ready/error.
 *
 * After the user grants consent once, the modal never appears again.
 * All progress feedback (cached model reload, re-download after cache eviction)
 * is shown as lightweight toasts that don't interrupt the user's workflow.
 *
 * Cache-hit suppression: the embedding service fires rapid download/done/ready
 * events even on cache hits (~100ms total). We debounce on the UI side — only
 * show toasts if the download phase persists beyond 400ms.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Download, Brain } from 'lucide-react';
import { toast as sonnerToast } from 'sonner';
import { onConsentNeeded } from '@extensions/rag';
import { onEmbeddingProgress, preloadModel, resetPipeline } from '@extensions/rag';
import type { EmbeddingProgress } from '@extensions/rag';
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

// Only show download toasts if downloading lasts longer than this.
// Cache hits complete in <200ms and should be silent.
const DOWNLOAD_DEBOUNCE_MS = 400;

export const ModelDownloadModal: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [resolver, setResolver] = useState<((granted: boolean) => void) | null>(null);

  // Subscribe to consent requests — only fires when hasConsent() is false
  useEffect(() => {
    const unsubscribe = onConsentNeeded((resolve) => {
      setResolver(() => resolve);
      setVisible(true);
    });
    return unsubscribe;
  }, []);

  // Subscribe to progress events — show toasts (not modals) after consent.
  // Uses a ref to avoid re-subscribing on every state change.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    let downloadToastId: string | number | undefined;
    let downloadStartedAt = 0;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let toastVisible = false; // whether we've actually shown a download toast
    let sessionNotified = false; // one "ready" toast per session

    const unsubscribe = onEmbeddingProgress((event: EmbeddingProgress) => {
      // Don't show toasts while the consent modal is up
      if (visibleRef.current) return;

      switch (event.status) {
        case 'downloading': {
          // Track when downloading started
          if (downloadStartedAt === 0) {
            downloadStartedAt = Date.now();
          }

          const elapsed = Date.now() - downloadStartedAt;

          // Only show toast after debounce window — cache hits never reach this
          if (elapsed >= DOWNLOAD_DEBOUNCE_MS) {
            const percent = event.percent ?? 0;
            const message = percent > 0
              ? `Downloading embedding model... ${percent}%`
              : 'Downloading embedding model...';

            if (downloadToastId) {
              sonnerToast.loading(message, { id: downloadToastId });
            } else {
              downloadToastId = sonnerToast.loading(message, { duration: Infinity });
              toastVisible = true;
            }
          } else if (!debounceTimer) {
            // Schedule the first toast to appear after the debounce if still downloading
            debounceTimer = setTimeout(() => {
              // If we're still in a download phase, show the toast
              if (downloadStartedAt > 0) {
                downloadToastId = sonnerToast.loading('Downloading embedding model...', { duration: Infinity });
                toastVisible = true;
              }
            }, DOWNLOAD_DEBOUNCE_MS - elapsed);
          }
          break;
        }

        case 'loading':
          // Clear debounce timer
          if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = undefined;
          }

          // Dismiss download toast if it was shown
          if (downloadToastId) {
            sonnerToast.dismiss(downloadToastId);
            downloadToastId = undefined;
          }

          // Only show loading toast if we visibly showed a download toast
          // (i.e., this was a real download, not a cache hit)
          if (toastVisible) {
            sonnerToast.loading('Initializing embedding model...', {
              id: 'rag-model-loading',
              duration: 10000,
            });
          }
          break;

        case 'ready':
          // Clear debounce timer
          if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = undefined;
          }

          // Reset download tracking
          downloadStartedAt = 0;

          // Dismiss any lingering toasts
          if (downloadToastId) {
            sonnerToast.dismiss(downloadToastId);
            downloadToastId = undefined;
          }
          sonnerToast.dismiss('rag-model-loading');

          // Show success toast once per session, but only if we showed
          // download/loading feedback (real download, not silent cache hit)
          if (toastVisible && !sessionNotified) {
            sonnerToast.success('Smart meeting search ready', { duration: 2000 });
            sessionNotified = true;
          }

          toastVisible = false;
          break;

        case 'error':
          // Clear debounce timer
          if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = undefined;
          }

          // Reset download tracking
          downloadStartedAt = 0;
          toastVisible = false;

          if (downloadToastId) {
            sonnerToast.dismiss(downloadToastId);
            downloadToastId = undefined;
          }
          sonnerToast.dismiss('rag-model-loading');

          sonnerToast.error(event.error || 'Embedding model failed to load', {
            duration: 8000,
            action: {
              label: 'Retry',
              onClick: () => {
                resetPipeline();
                preloadModel().catch(() => {});
              },
            },
          });
          break;
      }
    });

    return () => {
      unsubscribe();
      if (debounceTimer) clearTimeout(debounceTimer);
      if (downloadToastId) sonnerToast.dismiss(downloadToastId);
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
          <div className="flex flex-col">
            {/* Icon */}
            <div className={`w-12 h-12 rounded-full ${SURFACE.infoCallout} flex items-center justify-center mb-4`}>
              <Brain className={`w-6 h-6 ${TEXT.link}`} />
            </div>

            {/* Title */}
            <AlertDialogTitle className="mb-2">
              Enable Smart Meeting Search?
            </AlertDialogTitle>

            {/* Description */}
            <AlertDialogDescription className="mb-4">
              To automatically find relevant meetings for your questions, Kasset needs to download a small AI model that runs entirely on your device.
            </AlertDialogDescription>

            {/* Feature list */}
            <div className={`${SURFACE.subtle} border ${BORDER.default} ${RADIUS.lg} p-3 mb-6 space-y-1.5`}>
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

            {/* Actions */}
            <div className="flex gap-3">
              <AlertDialogCancel asChild>
                <button className={`flex-1 px-4 py-2.5 ${COMPONENT.secondaryButton} ${RADIUS.lg} ${TYPOGRAPHY_CLASSES.settingsButton}`}>
                  Not Now
                </button>
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <button
                  onClick={handleAccept}
                  className={`flex-1 px-4 py-2.5 ${COMPONENT.accentButton} ${RADIUS.lg} ${TYPOGRAPHY_CLASSES.settingsButton} ${SHADOW.float}`}
                >
                  Download Model
                </button>
              </AlertDialogAction>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialog>
  );
};

export default ModelDownloadModal;
