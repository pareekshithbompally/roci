/**
 * ActivityTray — unified bottom-right tray for all ongoing operations.
 *
 * Structure:
 *   Header: "Activity (N)" + collapse/expand + dismiss-completed
 *   Body:   scrollable list of rows (max ~5 visible, scroll for rest)
 *   Footer: overflow count + "Cancel all" (when imports queued)
 *
 * Reads from activityStore. Empty = renders nothing.
 * Priority ordering: recording > active > queued > complete/error/cancelled.
 *
 * Position: fixed bottom-right. Spring animation on mount/unmount.
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useActivityItems, activityStore } from '@shared/stores/activityStore';
import type { ActivityItem, ActivityType, ActivityStatus } from '@shared/stores/activityStore';
import { RecordingRow } from './activity-rows/RecordingRow';
import { ProcessingRow } from './activity-rows/ProcessingRow';
import { DownloadRow } from './activity-rows/DownloadRow';
import { IndexingRow } from './activity-rows/IndexingRow';
import { UI_CONFIG } from '@config/ui.config';

const ROW_SPRING = { type: 'spring' as const, stiffness: 400, damping: 30 };

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

  const sorted = useMemo(() => sortItems(items), [items]);

  const { maxVisibleRows, rowHeight, width, zIndex } = UI_CONFIG.activityTray;
  const maxBodyHeight = maxVisibleRows * rowHeight;

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
      {items.length > 0 && (
        <motion.div
          layout
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={ROW_SPRING}
          className="fixed bottom-4 right-4 rounded-xl overflow-hidden flex flex-col"
          style={{
            width,
            zIndex,
            backgroundColor: 'var(--surface-modal)',
            border: '1px solid var(--border-strong)',
            boxShadow: 'var(--shadow-float)',
          }}
        >
          {/* Header — entire row is clickable to collapse/expand */}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="flex items-center gap-2 px-3 py-2 shrink-0 w-full text-left transition-colors hover:opacity-80"
            style={{ borderBottom: collapsed ? 'none' : '1px solid var(--border-default)' }}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <span
              className="text-xs font-semibold flex-1"
              style={{ color: 'var(--text-primary)' }}
            >
              Activity ({items.length})
            </span>
            {hasDismissable && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); dismissCompleted(); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); dismissCompleted(); } }}
                className="p-1 rounded-md transition-colors hover:opacity-80"
                style={{ color: 'var(--text-faint)' }}
                title="Dismiss completed"
              >
                <X className="w-3.5 h-3.5" />
              </span>
            )}
            {collapsed ? <ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--text-faint)' }} /> : <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-faint)' }} />}
          </button>

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
                  {sorted.map((item, idx) => (
                    <div key={item.id}>
                      {idx > 0 && (
                        <div
                          className="mx-3 h-px"
                          style={{ backgroundColor: 'var(--border-default)' }}
                        />
                      )}
                      {renderRow(item)}
                    </div>
                  ))}
                </div>

                {/* Footer — overflow summary + cancel all */}
                {(queuedCount > 0 || hasQueuedImports) && (
                  <div
                    className="flex items-center gap-2 px-3 py-2 shrink-0"
                    style={{ borderTop: '1px solid var(--border-default)' }}
                  >
                    {queuedCount > 0 && (
                      <span
                        className="text-[11px] flex-1"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {queuedCount} queued
                      </span>
                    )}
                    {hasQueuedImports && (
                      <button
                        onClick={cancelAll}
                        className="text-[11px] font-medium px-2 py-0.5 rounded transition-colors hover:opacity-80"
                        style={{ color: 'var(--text-faint)' }}
                      >
                        Cancel all
                      </button>
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
