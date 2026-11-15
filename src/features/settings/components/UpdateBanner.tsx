/** Bottom-right card shown when an update is available: release notes, remind later, update now. */

import React from 'react';
import { Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { open } from '@tauri-apps/plugin-shell';
import { Button, Icon, Surface, Text } from '@shared/ui';

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
        className="fixed bottom-6 right-6 z-50"
      >
        <Surface variant="floating" radius="lg" className="p-4 min-w-80 max-w-sm">
          <div className="flex items-start gap-3 mb-3">
            <Icon icon={Download} size="md" className="shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <Text as="p" variant="title">New Version {version}</Text>
              <Text as="p" variant="helper" tone="muted" className="mt-0.5">Update Available</Text>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="link" size="inline" onClick={handleShowReleaseNotes}>
              Show Release Notes
            </Button>
            <Button variant="link" size="inline" onClick={onDismiss} disabled={isDownloading}>
              Remind Me Later
            </Button>
            <Button variant="primary" size="sm" onClick={onUpdate} disabled={isDownloading}>
              {isDownloading ? 'Downloading…' : 'Update Now'}
            </Button>
          </div>
        </Surface>
      </motion.div>
    </AnimatePresence>
  );
};

export default UpdateBanner;
