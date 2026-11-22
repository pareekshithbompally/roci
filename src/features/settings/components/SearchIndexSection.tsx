/** Search Index: how many meetings and chats are indexed, re-index each, or rebuild everything. */

import React, { useCallback, useState } from 'react';
import { CardRow, Section, Status } from '@shared/ui';
import { useToast } from '@shared/contexts/ToastContext';
import { confirm } from '@shared/stores/confirmStore';
import { rebuildSearchIndex, type RebuildScope } from '@extensions/rag';
import { useIndexStats } from '@features/settings/hooks/useIndexStats';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { PENDING } from './shared';

const FOOTER = 'Rebuild All wipes and re-indexes every meeting and chat.';

const REINDEX_FAILED: Record<RebuildScope, string> = {
  meetings: 'Couldn’t re-index meetings',
  chats: 'Couldn’t re-index chats',
  all: 'Couldn’t rebuild the index',
};

/** Index row: status badge, counts, and a re-index button */
const IndexActionRow: React.FC<{
  label: string;
  /** Undefined until stats load. */
  indexed?: number;
  total?: number;
  detail?: string;
  onReindex: () => void;
  busy: boolean;
  disabled: boolean;
}> = ({ label, indexed, total, detail, onReindex, busy, disabled }) => (
  <CardRow
    title={label}
    description={total != null && indexed !== undefined ? `${indexed} of ${total} indexed · ${detail}` : detail}
    status={indexed === undefined ? <Status>{PENDING}</Status> : <IndexStatus indexed={indexed} total={total} />}
    action={{ label: busy ? 'Indexing…' : `Re-index ${label}`, onPress: onReindex, busy, disabled }}
  />
);

/** Synced / Stale against a total; Active / Empty without one. Counts live in the description. */
const IndexStatus: React.FC<{ indexed: number; total?: number }> = ({ indexed, total }) => {
  if (total == null) {
    return indexed > 0 ? <Status tone="success">Active</Status> : <Status>Empty</Status>;
  }
  return indexed >= total ? <Status tone="success">Synced</Status> : <Status tone="warning">Stale</Status>;
};

export const SearchIndexSection: React.FC = () => {
  const { data: indexStats } = useIndexStats();
  const { showToast } = useToast();
  const [running, setRunning] = useState<RebuildScope | null>(null);

  /** Clears and indexes `scope` again in Rust; the counts refresh when it's done. */
  const reindex = useCallback(async (scope: RebuildScope) => {
    setRunning(scope);
    try {
      await rebuildSearchIndex(scope);
    } catch (error: unknown) {
      console.error('[SearchIndexSection] Re-index failed:', scope, error);
      showToast(REINDEX_FAILED[scope], 'error');
    } finally {
      setRunning(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.indexStats() });
    }
  }, [showToast]);

  const handleRebuildIndex = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Rebuild the search index?',
      description: 'Clears and re-indexes every meeting and chat. This can take a while.',
      confirmLabel: 'Rebuild',
      tone: 'danger',
    });
    if (confirmed) await reindex('all');
  }, [reindex]);

  const indexBusy = running !== null;

  return (
    <Section title="Search Index" footer={FOOTER}>
      <IndexActionRow
        label="Meetings"
        indexed={indexStats?.meetings.indexed}
        total={indexStats?.meetings.onDisk}
        detail={indexStats ? `${indexStats.pieces.transcript} transcript pieces` : PENDING}
        onReindex={() => void reindex('meetings')}
        busy={running === 'meetings'}
        disabled={indexBusy}
      />
      <IndexActionRow
        label="Chats"
        indexed={indexStats?.chats.indexed}
        total={indexStats?.chats.onDisk}
        detail={indexStats ? `${indexStats.pieces.chat} chat pieces` : PENDING}
        onReindex={() => void reindex('chats')}
        busy={running === 'chats'}
        disabled={indexBusy}
      />
      <CardRow
        title={running === 'all' ? 'Rebuilding…' : 'Rebuild All'}
        tone={indexBusy ? undefined : 'accent'}
        onPress={indexBusy ? undefined : () => void handleRebuildIndex()}
      />
    </Section>
  );
};
