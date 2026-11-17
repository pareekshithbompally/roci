/** Processed meeting results with tabs for summary, transcript, todos, and notes. */

import React, { useState, useEffect } from 'react';
import { Pencil, Plus, Clock, Users, ExternalLink } from 'lucide-react';
import { useAppResult, useActiveResultTab, useSelectedHistoryId, useAppActions } from '@shared/stores/appStore';
import type { ResultTab } from '@shared/stores/appStore';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { SummaryView } from '@features/summary';
import { ParsedTranscript } from '@features/transcription';
import { LAYOUT } from '@config/layout.config';
import { TodoList } from '@features/todos';
import { NotesView } from '@features/notes';
import { ResultsAudioPlayer } from './ResultsAudioPlayer';
import { openUrl } from '@services/tauri';
import { formatDuration } from '@shared/utils/formatters';
import { meetingPipeline } from '@features/recording';
import { useMeetingPhase } from '@shared/stores/meetingProgressStore';
import { MeetingStatus } from '@shared/components';
import { MeetingPhaseNotice } from './MeetingPhaseNotice';
import { MeetingActionsMenu } from './MeetingActionsMenu';
import { MeetingStatsPopover } from './MeetingStatsPopover';
import { ModelCreditLine } from './ModelCreditLine';
import { useMeetingStats } from '@features/home/hooks/useMeetingStats';
import type { HistoryItem } from '@shared/types';
import {
  Badge,
  Button,
  Icon,
  IconButton,
  Input,
  Surface,
  Tabs,
  Text,
  TitlebarSpacer,
  Tooltip,
  cn,
} from '@shared/ui';
import type { TabItem } from '@shared/ui';
import { TODOS_CONFIG } from '@config/todos.config';

const TAB_ITEMS: readonly TabItem<ResultTab>[] = [
  { value: 'summary', label: 'Summary' },
  { value: 'transcript', label: 'Transcript' },
  { value: 'todo', label: TODOS_CONFIG.title },
  { value: 'notes', label: 'Notes' },
];

/** Tabs that hold the user's own items: the tab bar's + adds one. */
const ADD_LABELS: Partial<Record<ResultTab, string>> = { todo: TODOS_CONFIG.add, notes: 'Add note' };

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const CalendarMetaRow: React.FC<{ item: HistoryItem }> = ({ item }) => {
  const hasParticipants = item.participants && item.participants.length > 0;
  const hasMeetingUrl = !!item.meetingUrl;

  const handleJoinMeeting = () => {
    if (item.meetingUrl) void openUrl(item.meetingUrl);
  };

  return (
    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
      {item.scheduledStart && (
        <Text variant="helper" tone="muted" className="flex items-center gap-1">
          <Icon icon={Clock} size="xs" />
          {formatDate(item.scheduledStart)}
          {' · '}
          {formatTime(item.scheduledStart)}
          {item.scheduledEnd && `–${formatTime(item.scheduledEnd)}`}
        </Text>
      )}
      {hasParticipants && (
        <Text
          variant="helper"
          tone="muted"
          className="flex items-center gap-1"
          title={item.participants!.map(p => p.name || p.email || 'Unknown').join(', ')}
        >
          <Icon icon={Users} size="xs" />
          {item.participants!.length} participant{item.participants!.length !== 1 ? 's' : ''}
        </Text>
      )}
      {hasMeetingUrl && (
        <Button variant="link" size="inline" onClick={handleJoinMeeting}>
          <Icon icon={ExternalLink} size="xs" />
          Join Meeting
        </Button>
      )}
    </div>
  );
};

/** Category · date · length, under the title. */
const MeetingMetaLine: React.FC<{ categories: string[]; meetingId: string }> = ({ categories, meetingId }) => {
  const { data: stats } = useMeetingStats(meetingId);
  const facts = [
    stats && new Date(stats.recordedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }),
    stats?.durationSeconds != null && formatDuration(stats.durationSeconds),
  ].filter(Boolean);
  if (categories.length === 0 && facts.length === 0) return null;
  return (
    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
      {categories.map((c) => <Badge key={c} dot={false}>{c}</Badge>)}
      {facts.length > 0 && <Text variant="helper" tone="muted">{facts.join(' · ')}</Text>}
    </div>
  );
};

/** The title, cut off at the title width with the full text on hover; the edit pencil sits right after it. */
const MeetingTitle: React.FC<{ title: string; onEdit: () => void; children?: React.ReactNode }> = ({ title, onEdit, children }) => (
  <div className={`flex items-center gap-1 min-w-0 ${LAYOUT.meetingTitle}`}>
    <Tooltip content={title}>
      <Text as="h1" variant="pageTitle" truncate>{title}</Text>
    </Tooltip>
    <IconButton icon={Pencil} size="sm" label="Rename" className="shrink-0" onClick={onEdit} />
    {children}
  </div>
);

export const ResultsView: React.FC = () => {
  const result = useAppResult();
  const activeResultTab = useActiveResultTab();
  const selectedHistoryId = useSelectedHistoryId();
  const { setActiveResultTab, setResult } = useAppActions();
  const { items: historyItems, renameItem } = useHistoryData();

  const currentHistoryItem = selectedHistoryId
    ? historyItems.find(item => item.id === selectedHistoryId)
    : null;
  const recordingFileName = currentHistoryItem?.recordingFileName;
  const phase = useMeetingPhase(currentHistoryItem);
  const { data: stats } = useMeetingStats(currentHistoryItem?.id);
  const handleTranscribe = () => {
    if (currentHistoryItem) meetingPipeline.toggle(currentHistoryItem.id);
  };

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  /** The tab whose new-item form is open (To-Do or Notes); one at a time, closed when the meeting changes. */
  const [draftingTab, setDraftingTab] = useState<ResultTab | null>(null);
  const addLabel = ADD_LABELS[activeResultTab];
  const draftProps = (tab: ResultTab) => ({
    creating: draftingTab === tab,
    onCreatingChange: (creating: boolean) => setDraftingTab(creating ? tab : null),
  });

  useEffect(() => setDraftingTab(null), [selectedHistoryId]);

  // Sync the editable title when a new result loads.
  useEffect(() => {
    if (result) setEditedTitle(result.title);
  }, [result]);

  if (!result) return null;

  const handleTitleSave = async () => {
    const title = editedTitle.trim();
    if (title && title !== result.title && currentHistoryItem && await renameItem(currentHistoryItem.id, title)) {
      setResult({ ...result, title });
    }
    setIsEditingTitle(false);
  };

  const handleTitleCancel = () => {
    setEditedTitle(result.title);
    setIsEditingTitle(false);
  };

  const exportPart = activeResultTab === 'transcript' ? 'transcript' : 'summary';

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <TitlebarSpacer />
      {/* Meeting title — same page column as Settings */}
      <div className={`${LAYOUT.pageGutter} pt-3 pb-3`}>
      <div className={LAYOUT.pageColumn}>
        {isEditingTitle ? (
          <div className="flex items-center gap-2">
            <Input
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleTitleSave();
                if (e.key === 'Escape') handleTitleCancel();
              }}
              className="flex-1"
              autoFocus
            />
            <Button variant="primary" size="sm" onClick={() => void handleTitleSave()}>
              Save
            </Button>
            <Button variant="secondary" size="sm" onClick={handleTitleCancel}>
              Cancel
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <MeetingTitle title={result.title} onEdit={() => setIsEditingTitle(true)}>
                {currentHistoryItem && <MeetingStatsPopover meetingId={currentHistoryItem.id} />}
              </MeetingTitle>
              <MeetingStatus phase={phase} display="badge" />
              <div className="ml-auto shrink-0">
                <MeetingActionsMenu
                  result={result}
                  part={exportPart}
                  recordingPath={stats?.recording?.path ?? null}
                  onRetranscribe={recordingFileName && phase.kind === 'ready' ? handleTranscribe : undefined}
                />
              </div>
            </div>
            {currentHistoryItem && <MeetingMetaLine categories={result.categories ?? []} meetingId={currentHistoryItem.id} />}
            {currentHistoryItem?.scheduledStart && (
              <CalendarMetaRow item={currentHistoryItem} />
            )}
            <div className="mt-3 empty:hidden">
              <MeetingPhaseNotice
                phase={phase}
                onAction={currentHistoryItem ? handleTranscribe : undefined}
              />
            </div>
          </>
        )}
      </div>
      </div>

      {/* Tabs Navigation */}
      <Surface edge="bottom" className={LAYOUT.pageGutter}>
      <div className={`${LAYOUT.pageColumn} flex items-center gap-2 h-11`}>
        <Tabs items={TAB_ITEMS} value={activeResultTab} onValueChange={setActiveResultTab} />
        {addLabel && (
          <IconButton
            icon={Plus}
            label={addLabel}
            size="sm"
            className="ml-auto"
            disabled={draftingTab === activeResultTab}
            onClick={() => setDraftingTab(activeResultTab)}
          />
        )}
      </div>
      </Surface>

      {/* Audio Player - always visible above content when recording file exists */}
      {recordingFileName && (
        <ResultsAudioPlayer
          recordingFileName={recordingFileName}
          meetingId={currentHistoryItem?.id || ''}
          title={currentHistoryItem?.title || ''}
        />
      )}

      {/* Tab Content */}
      <div className={cn('flex-1 overflow-y-auto custom-scrollbar pt-4', LAYOUT.pageGutter, LAYOUT.meetingChatClearance)}>
      <div className={`${LAYOUT.pageColumn} min-h-full flex flex-col`}>
        {activeResultTab === 'summary' && (
          <>
            {stats && (result.summary || result.structuredSummary) && (
              <div className="mb-4">
                <ModelCreditLine transcribedBy={stats.transcribedBy} summarizedBy={stats.summarizedBy} />
              </div>
            )}
            <SummaryView
              summary={result.summary}
              structuredSummary={result.structuredSummary}
              timestamp={result.timestamp}
              title={result.title}
            />
          </>
        )}
        {activeResultTab === 'transcript' && (
          <ParsedTranscript text={result.transcript} segments={result.segments} />
        )}
        {activeResultTab === 'todo' && (
          <TodoList {...draftProps('todo')} />
        )}
        {activeResultTab === 'notes' && (
          <NotesView {...draftProps('notes')} />
        )}
      </div>
      </div>
    </div>
  );
};

export default ResultsView;
