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
import { SEARCH_INDEX_COPY } from '@config/settingsCopy.config';

const COPY = SEARCH_INDEX_COPY;

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
    description={total != null && indexed !== undefined ? COPY.counts(indexed, total, detail ?? '') : detail}
    status={indexed === undefined ? <Status state="preparing">{PENDING}</Status> : <IndexStatus indexed={indexed} total={total} />}
    action={{ label: busy ? COPY.indexing : COPY.reindex(label), onPress: onReindex, busy, disabled }}
  />
);

/** Synced / Stale against a total; Active / Empty without one. Counts live in the description. */
const IndexStatus: React.FC<{ indexed: number; total?: number }> = ({ indexed, total }) => {
  if (total == null) {
    return indexed > 0 ? <Status state="ready">{COPY.status.active}</Status> : <Status state="idle">{COPY.status.empty}</Status>;
  }
  return indexed >= total ? <Status state="ready">{COPY.status.synced}</Status> : <Status state="queued">{COPY.status.stale}</Status>;
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
      showToast(COPY.failed[scope], 'error');
    } finally {
      setRunning(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.indexStats() });
    }
  }, [showToast]);

  const handleRebuildIndex = useCallback(async () => {
    const confirmed = await confirm({
      ...COPY.rebuildConfirm,
      tone: 'danger',
    });
    if (confirmed) await reindex('all');
  }, [reindex]);

  const indexBusy = running !== null;

  return (
    <Section title={COPY.title} footer={COPY.footer}>
      <IndexActionRow
        label={COPY.meetings}
        indexed={indexStats?.meetings.indexed}
        total={indexStats?.meetings.onDisk}
        detail={indexStats ? COPY.transcriptPieces(indexStats.pieces.transcript) : PENDING}
        onReindex={() => void reindex('meetings')}
        busy={running === 'meetings'}
        disabled={indexBusy}
      />
      <IndexActionRow
        label={COPY.chats}
        indexed={indexStats?.chats.indexed}
        total={indexStats?.chats.onDisk}
        detail={indexStats ? COPY.chatPieces(indexStats.pieces.chat) : PENDING}
        onReindex={() => void reindex('chats')}
        busy={running === 'chats'}
        disabled={indexBusy}
      />
      <CardRow
        title={running === 'all' ? COPY.rebuilding : COPY.rebuild}
        tone={indexBusy ? undefined : 'accent'}
        onPress={indexBusy ? undefined : () => void handleRebuildIndex()}
      />
    </Section>
  );
};
