/**
 * UpdateBanner — floating card shown when a new version is available.
 *
 * Rendered at the bottom-right of the main content area.
 * Actions: Show Release Notes (opens browser), Remind Me Later (dismiss), Update Now.
 */

import React from 'react';
import { Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { open } from '@tauri-apps/plugin-shell';
import { SURFACE, BORDER, TEXT, RADIUS, SHADOW, COMPONENT } from '@config/theme.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';

interface UpdateBannerProps {
  version: string;
  releaseNotes: string | null;
  onUpdate: () => void;
  onDismiss: () => void;
  isDownloading: boolean;
}

const RELEASE_URL_BASE = 'https://github.com/pareekshithbompally/kasset-ai/releases/latest';

export const UpdateBanner: React.FC<UpdateBannerProps> = ({
  version,
  releaseNotes,
  onUpdate,
  onDismiss,
  isDownloading,
}) => {
  const handleShowReleaseNotes = async () => {
    try {
      await open(RELEASE_URL_BASE);
    } catch {
      window.open(RELEASE_URL_BASE, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className={`
          fixed bottom-6 right-6 z-50
          ${SURFACE.elevated} ${BORDER.glass} border
          ${RADIUS.lg} ${SHADOW.float}
          p-4 min-w-[320px] max-w-[400px]
        `}
      >
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className="shrink-0 mt-0.5">
            <Download className={`w-5 h-5 ${TEXT.primary}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`${TYPOGRAPHY_CLASSES.settingsTitle} ${TEXT.heading}`}>
              New Version {version}
            </p>
            <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted} mt-0.5`}>
              Update Available
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={handleShowReleaseNotes}
            className={COMPONENT.settingsLink}
          >
            Show Release Notes
          </button>
          <button
            onClick={onDismiss}
            disabled={isDownloading}
            className={COMPONENT.settingsLink}
          >
            Remind Me Later
          </button>
          <button
            onClick={onUpdate}
            disabled={isDownloading}
            className={COMPONENT.settingsButtonPrimary}
          >
            {isDownloading ? 'Downloading…' : 'Update Now'}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default UpdateBanner;
