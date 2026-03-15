/**
 * ActivityTray — unified bottom-right tray for all ongoing operations.
 *
 * Reads from activityStore. Renders one card with N rows.
 * Each row type has its own renderer. Empty = renders nothing.
 *
 * Position: fixed bottom-right, z-1200 (same as old RecordingWidget).
 * Width: 360px. Spring animation on mount/unmount.
 * CSS variables for dark mode (no .dark ancestor needed).
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useActivityItems } from '@shared/stores/activityStore';
import type { ActivityItem } from '@shared/stores/activityStore';
import { RecordingRow } from './activity-rows/RecordingRow';
import { ProcessingRow } from './activity-rows/ProcessingRow';
import { DownloadRow } from './activity-rows/DownloadRow';
import { IndexingRow } from './activity-rows/IndexingRow';

const ROW_SPRING = { type: 'spring' as const, stiffness: 400, damping: 30 };

function renderRow(item: ActivityItem) {
  switch (item.type) {
    case 'recording':
      return <RecordingRow item={item} />;
    case 'processing':
      return <ProcessingRow item={item} />;
    case 'download':
      return <DownloadRow item={item} />;
    case 'indexing':
      return <IndexingRow item={item} />;
    default:
      return null;
  }
}

export const ActivityTray: React.FC = () => {
  const items = useActivityItems();

  return (
    <AnimatePresence>
      {items.length > 0 && (
        <motion.div
          layout
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={ROW_SPRING}
          className="fixed bottom-4 right-4 w-[360px] rounded-xl overflow-hidden"
          style={{
            zIndex: 1200,
            backgroundColor: 'var(--surface-modal)',
            border: '1px solid var(--border-strong)',
            boxShadow: 'var(--shadow-float)',
          }}
        >
          <AnimatePresence initial={false}>
            {items.map((item, idx) => (
              <motion.div
                key={item.id}
                layout
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
              >
                {idx > 0 && (
                  <div
                    className="mx-3 h-px"
                    style={{ backgroundColor: 'var(--border-default)' }}
                  />
                )}
                {renderRow(item)}
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
