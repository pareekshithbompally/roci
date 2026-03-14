/**
 * DownloadBanner
 *
 * Global floating indicator for active llama.cpp downloads (model or binary).
 * Rendered in App.tsx — visible from any screen, survives tab/view switches.
 *
 * Uses CSS custom properties (not Tailwind dark: variants) because this is a
 * fixed-position element that may render outside the .dark ancestor scope.
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useActiveDownload, downloadStore } from '@extensions/llamacpp/downloadStore';

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

/** All colors via CSS vars so dark/light mode always works on fixed elements */
const css = {
  heading: { color: 'var(--text-primary)' },
  muted: { color: 'var(--text-muted)' },
  faint: { color: 'var(--text-faint)' },
  error: { color: '#ef4444' },
  success: { color: '#22c55e' },
  link: { color: '#3b82f6' },
} as const;

export const DownloadBanner: React.FC = () => {
  const download = useActiveDownload();
  const [minimized, setMinimized] = useState(false);
  const prevDownloadId = useRef<string | null>(null);

  // Reset to expanded when a new download starts
  useEffect(() => {
    if (download && download.id !== prevDownloadId.current) {
      setMinimized(false);
      prevDownloadId.current = download.id;
    }
  }, [download?.id]);

  return (
    <AnimatePresence>
      {download && (
        <motion.div
          layout
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed bottom-4 right-4 z-50 w-80 rounded-xl overflow-hidden"
          style={{
            backgroundColor: 'var(--surface-modal)',
            border: '1px solid var(--border-strong)',
            boxShadow: 'var(--shadow-float)',
          }}
        >
          {/* Header row */}
          <div
            className={`flex items-center gap-2 px-3 ${minimized ? 'py-2.5' : 'pt-3 pb-1.5'}`}
          >
            <StatusIcon status={download.status} phase={download.phase} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-medium truncate" style={css.heading}>
                  {download.status === 'completed'
                    ? 'Download complete'
                    : download.status === 'cancelled'
                      ? 'Download cancelled'
                      : download.status === 'error'
                        ? 'Download failed'
                        : download.type === 'binary' && download.phase === 'extracting'
                          ? 'Extracting archive...'
                          : download.type === 'binary' && download.phase === 'validating'
                            ? 'Validating binary...'
                            : minimized
                              ? download.fileName
                              : `Downloading ${download.fileName}`}
                </p>
                {/* Percentage inline when minimized */}
                {minimized && download.status === 'downloading' && (
                  <span className="text-xs font-medium shrink-0" style={css.muted}>
                    {download.progress.percent}%
                  </span>
                )}
              </div>
              {download.status === 'error' && download.error && (
                <p className="text-[10px] truncate" style={css.error}>{download.error}</p>
              )}
            </div>

            {/* Minimize/expand toggle — only during downloading */}
            {download.status === 'downloading' && (
              <button
                onClick={() => setMinimized(!minimized)}
                className="p-1 rounded-md transition-colors hover:opacity-80"
                style={css.faint}
                title={minimized ? 'Expand' : 'Minimize'}
              >
                {minimized ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            )}

            {/* Cancel button — only while actively downloading */}
            {download.status === 'downloading' && (
              <button
                onClick={() => downloadStore.cancel()}
                className="p-1 rounded-md transition-colors hover:opacity-80"
                style={css.faint}
                title="Cancel download"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Progress section — hidden when minimized */}
          <AnimatePresence initial={false}>
            {download.status === 'downloading' && !minimized && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="px-3 pb-3 space-y-1.5">
                  {/* Byte counter + percentage */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px]" style={css.muted}>
                      {formatBytes(download.progress.bytesDownloaded)}
                      {download.progress.totalBytes > 0 &&
                        ` / ${formatBytes(download.progress.totalBytes)}`}
                    </span>
                    <span className="text-[10px]" style={css.muted}>
                      {download.progress.percent}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div
                    className="w-full h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: 'var(--border-strong)' }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: 'var(--text-primary)' }}
                      initial={false}
                      animate={{ width: `${download.progress.percent}%` }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                    />
                  </div>

                  <p className="text-[10px]" style={css.faint}>
                    Streaming to disk
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Terminal states show a compact bottom bar */}
          {download.status !== 'downloading' && (
            <div className="px-3 pb-2.5" />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/** Status icon with appropriate color/animation */
const StatusIcon: React.FC<{
  status: string;
  phase: string | null;
}> = ({ status, phase }) => {
  if (status === 'completed') {
    return <CheckCircle2 className="w-4 h-4 shrink-0" style={css.success} />;
  }
  if (status === 'error') {
    return <XCircle className="w-4 h-4 shrink-0" style={css.error} />;
  }
  if (status === 'cancelled') {
    return <XCircle className="w-4 h-4 shrink-0" style={css.faint} />;
  }

  // Extracting / validating
  if (phase === 'extracting' || phase === 'validating') {
    return <Loader2 className="w-4 h-4 shrink-0 animate-spin" style={css.link} />;
  }
  return <Download className="w-4 h-4 shrink-0" style={css.link} />;
};
