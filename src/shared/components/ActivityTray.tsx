/**
 * ActivityTray — sidebar section for all ongoing operations.
 *
 * Structure:
 *   Header: "Activity (N)" + collapse/expand + dismiss-completed
 *   Body:   scrollable list of rows (max ~5 visible, scroll for rest)
 *   Footer: overflow count + "Cancel all" (when imports queued)
 *
 * Reads from activityStore. Empty = renders nothing (transient).
 * Priority ordering: recording > active > queued > complete/error/cancelled.
 *
 * Position: in-flow sidebar footer. Animates in/out with height transition.
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useActivityItems, activityStore } from '@shared/stores/activityStore';
import type { ActivityItem, ActivityType, ActivityStatus } from '@shared/stores/activityStore';
import { useAudioPlayerStore } from '@shared/stores/audioPlayerStore';
import { useSelectedHistoryId } from '@shared/stores/appStore';
import { RecordingRow } from './activity-rows/RecordingRow';
import { ProcessingRow } from './activity-rows/ProcessingRow';
import { DownloadRow } from './activity-rows/DownloadRow';
import { IndexingRow } from './activity-rows/IndexingRow';
import { AudioPlaybackRow } from './activity-rows/AudioPlaybackRow';
import { UI_CONFIG } from '@config/ui.config';
import { Button, Icon, IconButton, Row, Text } from '@shared/ui';

// ── Priority ordering ────────────────────────────────────────────

/** Lower = higher priority (pinned to top) */
const TYPE_PRIORITY: Record<ActivityType, number> = {
  recording: 0,
  processing: 1,
  import: 2,
  download: 3,
  indexing: 4,
};

const STATUS_PRIORITY: Record<ActivityStatus, number> = {
  active: 0,
  error: 1,
  complete: 2,
  cancelled: 3,
};

function sortItems(items: ActivityItem[]): ActivityItem[] {
  return [...items].sort((a, b) => {
    const typeDiff = TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type];
    if (typeDiff !== 0) return typeDiff;
    return STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
  });
}

// ── Row renderer ────────────────────────────────────────────────

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
    case 'import':
      return <ProcessingRow item={item} />;
    default:
      return null;
  }
}

// ── Component ───────────────────────────────────────────────────

export const ActivityTray: React.FC = () => {
  const items = useActivityItems();
  const [collapsed, setCollapsed] = useState(false);
  const audioSession = useAudioPlayerStore((s) => s.session);
  const selectedHistoryId = useSelectedHistoryId();

  const isPlaying = useAudioPlayerStore((s) => s.isPlaying);
  const isAudioMinimized = !!audioSession && audioSession.meetingId !== selectedHistoryId && isPlaying;

  const sorted = useMemo(() => sortItems(items), [items]);

  const { maxVisibleRows, rowHeight } = UI_CONFIG.activityTray;
  const maxBodyHeight = maxVisibleRows * rowHeight;

  const hasContent = items.length > 0 || isAudioMinimized;

  // Count queued items beyond visible
  const queuedCount = sorted.filter(i => i.detail === 'Queued').length;
  const hasQueuedImports = sorted.some(i => i.type === 'import' && (i.detail === 'Queued' || i.status === 'active'));

  // Dismiss all completed/cancelled/error items
  const dismissCompleted = () => {
    for (const item of items) {
      if (item.status === 'complete' || item.status === 'cancelled' || item.status === 'error') {
        activityStore.remove(item.id);
      }
    }
  };

  const hasDismissable = items.some(
    i => i.status === 'complete' || i.status === 'cancelled' || i.status === 'error',
  );

  // Cancel all cancellable items (those with an 'x' action)
  const cancelAll = () => {
    for (const item of items) {
      const cancelAction = item.actions.find(a => a.icon === 'x');
      cancelAction?.onClick();
    }
  };

  return (
    <AnimatePresence>
      {hasContent && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="overflow-hidden shrink-0 mx-2 mb-1.5 rounded-lg bg-base shadow-raised"
        >
          {/* Header — the row toggles collapse; dismiss is a sibling button, not nested */}
          <div className={`flex items-center gap-1 px-1 py-1 ${collapsed ? '' : 'border-b border-muted'}`}>
            <Row onClick={() => setCollapsed(c => !c)} aria-expanded={!collapsed} className="flex-1">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-layer-4 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-inverse" />
              </span>
              <Text variant="label" className="flex-1">Activity ({items.length})</Text>
              <Icon icon={collapsed ? ChevronUp : ChevronDown} size="sm" className="text-faint" />
            </Row>
            {hasDismissable && <IconButton icon={X} label="Dismiss completed" size="sm" onClick={dismissCompleted} />}
          </div>

          {/* Body — scrollable, collapsible */}
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div
                  className="overflow-y-auto custom-scrollbar"
                  style={{ maxHeight: maxBodyHeight }}
                >
                  {/* Audio playback — always first */}
                  {isAudioMinimized && (
                    <>
                      <AudioPlaybackRow />
                      {sorted.length > 0 && (
                        <div className="mx-3 h-px bg-separator" />
                      )}
                    </>
                  )}
                  {sorted.map((item, idx) => (
                    <div key={item.id}>
                      {idx > 0 && (
                        <div className="mx-3 h-px bg-separator" />
                      )}
                      {renderRow(item)}
                    </div>
                  ))}
                </div>

                {/* Footer — overflow summary + cancel all */}
                {(queuedCount > 0 || hasQueuedImports) && (
                  <div
                    className="flex items-center gap-2 px-3 py-2 shrink-0 border-t border-muted"
                  >
                    {queuedCount > 0 && (
                      <Text variant="caption" tone="muted" className="flex-1">{queuedCount} queued</Text>
                    )}
                    {hasQueuedImports && (
                      <Button variant="ghost" size="sm" onClick={cancelAll}>Cancel all</Button>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
