/** A meeting after Stop: Summary, Transcript (the record screen's view kept — the transcript beside the notes) and To-dos. One
 *  status at a time: a badge while it works, a notice when it needs you. */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { Pencil, Plus, Clock, Users, ExternalLink, VolumeX } from 'lucide-react';
import { useActiveResultTab, useSelectedHistoryId, useAppActions } from '@shared/stores/appStore';
import { useMeetingResult } from '@shared/hooks/useMeetingResult';
import type { ResultTab } from '@shared/stores/appStore';
import { useMeetingBrief, useMeetingMutations } from '@shared/hooks/useMeetings';
import { LAYOUT } from '@config/layout.config';
import { TodoList } from '@features/todos';
import { ResultsAudioPlayer } from './ResultsAudioPlayer';
import { openUrl } from '@services/tauri';
import { formatDuration, calendarDayOffset, formatDayLabel, formatClockTime, formatShortDate, formatDateTime } from '@shared/utils/formatters';
import { MeetingWorkspace, meetingPipeline, useAiBullets, useDraftSegments, useLiveNotes, type WorkspaceTranscript } from '@features/recording';
import { useMeetingPhase } from '@shared/stores/meetingProgressStore';
import { LoadingPane, MeetingStatus, RemovedNotice } from '@shared/components';
import { StorageConfig } from '@config/storage.config';
import { MeetingPhaseNotice } from './MeetingPhaseNotice';
import { MeetingActionsMenu } from './MeetingActionsMenu';
import { MeetingStatsPopover } from './MeetingStatsPopover';
import { MeetingSourceIcon } from './MeetingSourceIcon';
import { SummaryTab } from './SummaryTab';
import { useMeetingStats } from '@features/home/hooks/useMeetingStats';
import type { HistoryItem, ProcessedResult } from '@shared/types';
import { isMeetingBusy, type MeetingPhase } from '@shared/types/meetingPhase';
import { meetingPhaseDetail } from '@config/meetingPhase.config';
import { LIVE_NOTES_CONFIG as NOTES } from '@config/liveNotes.config';
import { MEETING_LIVE_CONFIG as LIVE } from '@config/meetingLive.config';
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

const VIEW = ANIMATION_CONFIG.view;

const TAB_ITEMS: readonly TabItem<ResultTab>[] = [
  { value: 'summary', label: 'Summary' },
  { value: 'transcript', label: 'Transcript' },
  { value: 'todo', label: TODOS_CONFIG.title },
];

/** Today or Tomorrow, else "Nov 17". */
function formatDate(iso: string): string {
  const offset = calendarDayOffset(iso);
  if (offset === 0 || offset === 1) return formatDayLabel(iso);
  return formatShortDate(iso);
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
          {formatClockTime(item.scheduledStart)}
          {item.scheduledEnd && `–${formatClockTime(item.scheduledEnd)}`}
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

/** Category · date · length, under the title; holds its line while the stats load so the banner and tabs below never shift. */
const MeetingMetaLine: React.FC<{ categories: string[]; meetingId: string }> = ({ categories, meetingId }) => {
  const { data: stats, isPending } = useMeetingStats(meetingId);
  const facts = [
    stats && formatDateTime(stats.recordedAt),
    stats?.durationSeconds != null && formatDuration(stats.durationSeconds),
  ].filter(Boolean);
  if (!isPending && categories.length === 0 && facts.length === 0) return null;
  return (
    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
      {categories.map((c) => <Badge key={c} dot={false}>{c}</Badge>)}
      {/* A non-breaking space keeps the line's height until the facts arrive. */}
      <Text variant="helper" tone="muted">{facts.length > 0 ? facts.join(' · ') : '\u00A0'}</Text>
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

/** The Transcript tab: the saved transcript (or the in-call one until it is saved) beside the meeting's notes, whose AI lines
 *  are the summary's filled-in notes and key points. Keyed by meeting, so each meeting's notes load fresh. */
const TranscriptTab: React.FC<{ meetingId: string; result: ProcessedResult; phase: MeetingPhase }> = ({ meetingId, result, phase }) => {
  const { type, modelProblem } = useLiveNotes(meetingId, false);
  const draft = useDraftSegments(meetingId);
  const summary = result.structuredSummary;
  const bullets = useAiBullets(meetingId, summary?.enhancedNotes, summary?.keyDiscussionPoints);
  const saved = !!result.transcript;
  const busy = isMeetingBusy(phase);
  const transcript: WorkspaceTranscript = {
    label: saved || draft.length === 0 ? NOTES.copy.transcript : NOTES.copy.draftTranscript,
    segments: saved ? result.segments ?? [] : draft,
    text: saved ? result.transcript : undefined,
    empty: busy ? LIVE.copy.finalizing : meetingPhaseDetail(phase) ?? LIVE.copy.none,
    follow: false,
  };
  return (
    <MeetingWorkspace
      transcript={transcript}
      notes={{ onType: type, modelProblem, bullets, writing: busy, live: false }}
    />
  );
};

export const ResultsView: React.FC = () => {
  const activeResultTab = useActiveResultTab();
  const selectedHistoryId = useSelectedHistoryId();
  const { result, loading } = useMeetingResult(selectedHistoryId);
  const { setActiveResultTab } = useAppActions();
  const { renameMeeting } = useMeetingMutations();
  const currentHistoryItem = useMeetingBrief(selectedHistoryId);
  const recordingFileName = currentHistoryItem?.recordingFileName;
  const audioRemoved = !recordingFileName && currentHistoryItem?.audioRemovedAt !== undefined;
  const phase = useMeetingPhase(currentHistoryItem);
  const { data: stats } = useMeetingStats(currentHistoryItem?.id);
  const handleTranscribe = () => {
    if (currentHistoryItem) meetingPipeline.toggle(currentHistoryItem.id);
  };

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  /** The To-dos tab's new-item form is open; closed when the meeting changes. */
  const [addingTodo, setAddingTodo] = useState(false);

  useEffect(() => setAddingTodo(false), [selectedHistoryId]);


  if (loading) return <LoadingPane />;
  if (!result) return null;
  // the list's title is the one renames update at once (optimistically); the meeting's own follows from disk
  const shownTitle = currentHistoryItem?.title || result.title;

  const handleTitleSave = async () => {
    const title = editedTitle.trim();
    if (title && title !== shownTitle && currentHistoryItem) await renameMeeting(currentHistoryItem.id, title);
    setIsEditingTitle(false);
  };

  const handleTitleCancel = () => {
    setEditedTitle(shownTitle);
    setIsEditingTitle(false);
  };

  const exportPart = activeResultTab === 'transcript' ? 'transcript' : 'summary';

  return (
    <motion.div
      className="h-full flex flex-col overflow-hidden"
      initial={VIEW.hidden}
      animate={VIEW.shown}
      transition={VIEW.enter}
    >
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
              <MeetingSourceIcon inputSource={currentHistoryItem?.inputSource} />
              <MeetingTitle title={shownTitle} onEdit={() => { setEditedTitle(shownTitle); setIsEditingTitle(true); }}>
                {currentHistoryItem && <MeetingStatsPopover meetingId={currentHistoryItem.id} />}
              </MeetingTitle>
              {isMeetingBusy(phase) && <MeetingStatus phase={phase} display="badge" />}
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
        {activeResultTab === 'todo' && (
          <IconButton
            icon={Plus}
            label={TODOS_CONFIG.add}
            size="sm"
            className="ml-auto"
            disabled={addingTodo}
            onClick={() => setAddingTodo(true)}
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
      {audioRemoved && (
        <div className={`${LAYOUT.pageGutter} py-2`}>
          <div className={LAYOUT.pageColumn}>
            <RemovedNotice icon={VolumeX} label={StorageConfig.removed.audio} />
          </div>
        </div>
      )}

      {/* Tab content: the Transcript tab's panes scroll inside themselves; the other tabs scroll as a page. */}
      {activeResultTab === 'transcript' && currentHistoryItem ? (
        // the record screen's frame exactly: the panes run to the window's bottom edge, open there
        <div className={`${LAYOUT.pageGutter} flex-1 overflow-hidden pt-4`}>
          <div className={`${LAYOUT.pageColumn} h-full flex flex-col min-h-0`}>
            <TranscriptTab key={currentHistoryItem.id} meetingId={currentHistoryItem.id} result={result} phase={phase} />
          </div>
        </div>
      ) : activeResultTab === 'summary' ? (
        <SummaryTab result={result} phase={phase} meetingId={currentHistoryItem?.id} />
      ) : (
        <div className={cn('flex-1 overflow-y-auto custom-scrollbar pt-4', LAYOUT.pageGutter, LAYOUT.meetingChatClearance)}>
          <div className={`${LAYOUT.pageColumn} min-h-full flex flex-col`}>
            <TodoList creating={addingTodo} onCreatingChange={setAddingTodo} />
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default ResultsView;
