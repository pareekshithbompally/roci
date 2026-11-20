/** Search Index: how many meetings and chats are indexed, re-index each, or rebuild everything. */

import React, { useCallback, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, CardRow, Icon, Section, Status } from '@shared/ui';
import { useToast } from '@shared/contexts/ToastContext';
import { confirm } from '@shared/stores/confirmStore';
import { searchIndexingService } from '@services/searchIndexing.service';
import { useIndexStats } from '@features/settings/hooks/useIndexStats';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { PENDING } from './shared';

const FOOTER = 'Rebuild All wipes and re-indexes every meeting and chat.';

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
    actions={
      <Button variant="outline" size="sm" onClick={onReindex} disabled={disabled && !busy} loading={busy}>
        {!busy && <Icon icon={RefreshCw} size="xs" />}
        {busy ? 'Indexing…' : 'Re-index'}
      </Button>
    }
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
  const [rebuildingPhase, setRebuildingPhase] = useState<'meetings' | 'chats' | null>(null);
  const [isRebuilding, setIsRebuilding] = useState(false);

  const loadIndexStats = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.indexStats() });
  }, []);

  const handleReindexMeetings = useCallback(async () => {
    setRebuildingPhase('meetings');
    try {
      const { ragIndexer } = await import('@extensions/rag');
      const meetingItems = await searchIndexingService.loadMeetingsForIndexing();
      await ragIndexer.indexAll(meetingItems, { includeEmbeddings: true, force: true });
    } catch (error: unknown) {
      console.error('[SearchIndexSection] Meeting re-index failed:', error);
      showToast('Couldn’t re-index meetings', 'error');
    } finally {
      setRebuildingPhase(null);
      loadIndexStats();
    }
  }, [showToast, loadIndexStats]);

  const handleReindexChats = useCallback(async () => {
    setRebuildingPhase('chats');
    try {
      const { chatIndexer } = await import('@extensions/rag');
      const chatSessions = await searchIndexingService.loadChatsForIndexing();
      await chatIndexer.indexAllSessions(chatSessions, { includeEmbeddings: true, force: true });
    } catch (error: unknown) {
      console.error('[SearchIndexSection] Chat re-index failed:', error);
      showToast('Couldn’t re-index chats', 'error');
    } finally {
      setRebuildingPhase(null);
      loadIndexStats();
    }
  }, [showToast, loadIndexStats]);

  const handleRebuildIndex = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Rebuild the search index?',
      description: 'Clears and re-indexes every meeting and chat. This can take a while.',
      confirmLabel: 'Rebuild',
      tone: 'danger',
    });
    if (!confirmed) return;
    setIsRebuilding(true);

    try {
      const { vectorDB, ragIndexer, chatIndexer, isEmbeddingAvailable } = await import('@extensions/rag');

      await vectorDB.rebuild();
      const includeEmbeddings = await isEmbeddingAvailable();

      const [meetingItems, chatSessions] = await Promise.all([
        searchIndexingService.loadMeetingsForIndexing(),
        searchIndexingService.loadChatsForIndexing(),
      ]);

      setRebuildingPhase('meetings');
      try {
        await ragIndexer.indexAll(meetingItems, { includeEmbeddings });
      } catch (error: unknown) {
        console.error('[SearchIndexSection] Meeting indexing failed:', error);
        showToast('Couldn’t re-index meetings; chats continue', 'error');
      }
      loadIndexStats();

      setRebuildingPhase('chats');
      try {
        await chatIndexer.indexAllSessions(chatSessions, { includeEmbeddings });
      } catch (error: unknown) {
        console.error('[SearchIndexSection] Chat indexing failed:', error);
        showToast('Couldn’t re-index chats', 'error');
      }
    } catch (error: unknown) {
      console.error('[SearchIndexSection] Rebuild index failed:', error);
      showToast('Couldn’t rebuild the index', 'error');
    } finally {
      setRebuildingPhase(null);
      setIsRebuilding(false);
      loadIndexStats();
    }
  }, [showToast, loadIndexStats]);

  const indexBusy = rebuildingPhase !== null || isRebuilding;

  return (
    <Section title="Search Index" footer={FOOTER}>
      <IndexActionRow
        label="Meetings"
        indexed={indexStats?.meetings.indexed}
        total={indexStats?.meetings.onDisk}
        detail={indexStats ? `${indexStats.chunks.transcript} transcript chunks` : PENDING}
        onReindex={handleReindexMeetings}
        busy={rebuildingPhase === 'meetings'}
        disabled={indexBusy}
      />
      <IndexActionRow
        label="Chats"
        indexed={indexStats?.chats.indexed}
        total={indexStats?.chats.onDisk}
        detail={indexStats ? `${indexStats.chunks.total - indexStats.chunks.transcript} chat chunks` : PENDING}
        onReindex={handleReindexChats}
        busy={rebuildingPhase === 'chats'}
        disabled={indexBusy}
      />
      <CardRow
        title={isRebuilding ? 'Rebuilding…' : 'Rebuild All'}
        tone={indexBusy ? undefined : 'accent'}
        onPress={indexBusy ? undefined : () => void handleRebuildIndex()}
      />
    </Section>
  );
};
