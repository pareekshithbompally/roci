/** A meeting after Stop: Summary, Transcript (the record screen's view kept — the transcript beside the notes) and To-dos. One
 *  status at a time: a badge while it works, a notice when it needs you. */

import React, { useEffect, useState } from 'react';
import { endCreate, startCreate, useCreateFlow } from '@shared/stores/createStore';
import { useMeetingNotes } from '@features/notes';
import { motion } from 'framer-motion';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { Clock, Users, ExternalLink, ListChecks, NotebookPen, VolumeX } from 'lucide-react';
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
import { ItemActions, LoadingPane, MeetingStatus, RemovedNotice, RenameModal } from '@shared/components';
import { StorageConfig } from '@config/storage.config';
import { MeetingPhaseNotice } from './MeetingPhaseNotice';
import { meetingMenuEntries } from './meetingMenu';
import { MeetingDetailsDialog } from './MeetingDetailsDialog';
import { MeetingSourceIcon } from './MeetingSourceIcon';
import { SummaryTab } from './SummaryTab';
import { RelatedTab } from './RelatedTab';
import { TabFlowContext, TabPage } from './TabPage';
import { KNOWLEDGE_GRAPH } from '@config/knowledge.config';
import { useMeetingStats } from '@features/home/hooks/useMeetingStats';
import type { HistoryItem, ProcessedResult } from '@shared/types';
import { isMeetingBusy, type MeetingPhase } from '@shared/types/meetingPhase';
import { meetingPhaseDetail } from '@config/meetingPhase.config';
import { LIVE_NOTES_CONFIG as NOTES } from '@config/liveNotes.config';
import { MEETING_ADD_COPY, MEETING_LIVE_CONFIG as LIVE, MEETING_TABS } from '@config/meetingLive.config';
import {
  Badge,
  Button,
  Icon,
  PageScroll,
  PushedPage,
  Surface,
  cn,
  useListBesideDetail,
  Tabs,
  TitleBlock,
  Text,
  Tooltip,
  TopicLine,
  TopicSection,
  motionFor,
} from '@shared/ui';
import type { TabItem } from '@shared/ui';
import { TODOS_CONFIG } from '@config/todos.config';


const VIEW = ANIMATION_CONFIG.view;

/** One segmented control (HIG: one, few segments). Notes sit beside the transcript on a Mac and open from the + on a phone;
 *  Related needs a Mac's room. */
const TAB_ITEMS: readonly TabItem<ResultTab>[] = [
  { value: 'summary', label: MEETING_TABS.summary },
  { value: 'transcript', label: MEETING_TABS.transcript },
  { value: 'todo', label: TODOS_CONFIG.title },
  { value: 'related', label: KNOWLEDGE_GRAPH.tab, only: 'desktop' },
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
    <div className="flex items-center gap-3 flex-wrap">
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

/** The title on one line, cut off with the full text on hover; rename and details live in the ⋯ menu. */
const MeetingTitle: React.FC<{ title: string }> = ({ title }) => (
  <div className={`flex min-w-0 items-center ${LAYOUT.meetingTitle}`}>
    <Tooltip content={title}>
      <Text as="h1" variant="pageTitle" truncate>{title}</Text>
    </Tooltip>
  </div>
);

/** iPhone: your notes at the end of the Summary, in the summary's own pattern; Edit opens them as their screen. A Mac shows
 *  them beside the transcript instead. */
const YourNotesSection: React.FC<{ meetingId: string }> = ({ meetingId }) => {
  const { notes } = useMeetingNotes(meetingId);
  if (notes.length === 0) return null;
  const lines = [...notes].sort((a, b) => a.timestamp - b.timestamp);
  return (
    <TopicSection
      title={MEETING_ADD_COPY.yourNotes}
      icon={NotebookPen}
      count={lines.length}
      action={<Button variant="link" size="inline" onClick={() => startCreate('note', meetingId)}>{MEETING_ADD_COPY.editNotes}</Button>}
    >
      {lines.map((note) => <TopicLine key={note.id}>{note.text}</TopicLine>)}
    </TopicSection>
  );
};

/** The Transcript tab: the saved transcript (or the in-call one until it is saved) beside the meeting's notes, whose AI lines
 *  are the summary's filled-in notes and key points. Keyed by meeting, so each meeting's notes load fresh. */
const TranscriptTab: React.FC<{ meetingId: string; result: ProcessedResult; phase: MeetingPhase; only: 'transcript' | 'notes'; focusNotes?: boolean }> = ({ meetingId, result, phase, only, focusNotes }) => {
  const { type, modelProblem } = useLiveNotes(meetingId);
  const draft = useDraftSegments(meetingId);
  const summary = result.structuredSummary;
  const bullets = useAiBullets(meetingId, summary?.enhancedNotes, summary?.keyDiscussionPoints);
  const saved = !!result.transcript;
  const busy = isMeetingBusy(phase);
  const transcript: WorkspaceTranscript = {
    label: saved || draft.length === 0 ? NOTES.copy.transcript : NOTES.copy.draftTranscript,
    segments: saved ? result.segments ?? [] : draft,
    text: saved ? result.transcript : undefined,
    // while it records there is no final transcript to build yet: it is written after Stop
    empty: phase.kind === 'recording' || phase.kind === 'paused' ? LIVE.copy.liveOff : busy ? LIVE.copy.finalizing : meetingPhaseDetail(phase) ?? LIVE.copy.none,
    follow: false,
  };
  return (
    <MeetingWorkspace
      transcript={transcript}
      notes={{ onType: type, ai: { modelProblem, bullets, writing: busy }, focus: focusNotes }}
      only={only}
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

  /** The ⋯ menu's sheets: rename the meeting, or see its details. */
  const [sheet, setSheet] = useState<'rename' | 'details' | null>(null);
  // Notes sit beside the transcript (Mac, iPad): + › Note goes there. Without the room (iPhone) they open as a screen.
  const notesBeside = useListBesideDetail();
  const flow = useCreateFlow();
  const writingNote = flow?.kind === 'note' && flow.meetingId === selectedHistoryId;
  /** Each + › Note beside the transcript: the Transcript tab, with its notes open and the caret in them. */
  const [noteVisit, setNoteVisit] = useState(0);
  useEffect(() => {
    if (!writingNote || !notesBeside) return;
    setActiveResultTab('transcript');
    setNoteVisit((n) => n + 1);
    endCreate();
  }, [writingNote, notesBeside, setActiveResultTab]);


  if (loading) return <LoadingPane />;
  if (!result) return null;
  // the list's title is the one renames update at once (optimistically); the meeting's own follows from disk
  const shownTitle = currentHistoryItem?.title || result.title;

  const saveTitle = (title: string) => {
    if (currentHistoryItem) {
      renameMeeting(currentHistoryItem.id, title).catch((error: unknown) => console.error('[ResultsView] Rename failed:', error));
    }
  };

  const exportPart = activeResultTab === 'transcript' ? 'transcript' : 'summary';
  // ✦ Ask, To-do and Note in plain sight (as a document's); the rare ones behind ⋯. In the header on a Mac, the toolbar on iPhone.
  const meetingId = currentHistoryItem?.id;
  const itemActions = (placement: 'header' | 'bottom') => meetingId && (
    <ItemActions
      placement={placement}
      onAsk={() => startCreate('chat', meetingId)}
      actions={[
        { icon: ListChecks, label: MEETING_ADD_COPY.todo, onPress: () => startCreate('todo', meetingId) },
        { icon: NotebookPen, label: MEETING_ADD_COPY.note, onPress: () => startCreate('note', meetingId) },
      ]}
      more={meetingMenuEntries({
        result,
        part: exportPart,
        recordingPath: stats?.recording?.path ?? null,
        onRetranscribe: recordingFileName && phase.kind === 'ready' ? handleTranscribe : undefined,
        onRename: () => setSheet('rename'),
        onDetails: () => setSheet('details'),
      })}
    />
  );

  const header = (
    <TitleBlock
        title={
          <>
            <MeetingSourceIcon inputSource={currentHistoryItem?.inputSource} />
            <MeetingTitle title={shownTitle} />
          </>
        }
        meta={currentHistoryItem && <MeetingMetaLine categories={result.categories ?? []} meetingId={currentHistoryItem.id} />}
        status={isMeetingBusy(phase) && <MeetingStatus phase={phase} display="badge" />}
        accessory={itemActions('header')}
      >
        {currentHistoryItem?.scheduledStart && <CalendarMetaRow item={currentHistoryItem} />}
        <div className="empty:hidden">
          <MeetingPhaseNotice phase={phase} onAction={currentHistoryItem ? handleTranscribe : undefined} />
        </div>
    </TitleBlock>
  );

  const tabs = (
    <Surface variant="page" edge="bottom" className={cn(LAYOUT.pageGutter, !notesBeside && 'sticky top-0 z-10')}>
      <div className={`${LAYOUT.pageColumn} flex items-center gap-2 h-11`}>
        <Tabs items={TAB_ITEMS} value={activeResultTab} onValueChange={setActiveResultTab} />
      </div>
    </Surface>
  );

  const media = (
    <>
      {recordingFileName && (
        <ResultsAudioPlayer recordingFileName={recordingFileName} meetingId={currentHistoryItem?.id || ''} title={currentHistoryItem?.title || ''} />
      )}
      {audioRemoved && (
        <div className={`${LAYOUT.pageGutter} py-2`}>
          <div className={LAYOUT.pageColumn}>
            <RemovedNotice icon={VolumeX} label={StorageConfig.removed.audio} />
          </div>
        </div>
      )}
    </>
  );

  // The Transcript tab's panes scroll inside themselves beside each other (a Mac); the other tabs scroll as a page.
  const body = activeResultTab === 'transcript' && currentHistoryItem ? (
    <div className={cn(LAYOUT.pageGutter, 'pt-4', notesBeside ? 'flex-1 overflow-hidden' : LAYOUT.fabClearance)}>
      <div className={cn(LAYOUT.pageColumn, notesBeside && 'h-full flex flex-col min-h-0')}>
        <TranscriptTab key={`${currentHistoryItem.id}-${noteVisit}`} meetingId={currentHistoryItem.id} result={result} phase={phase} only="transcript" focusNotes={noteVisit > 0} />
      </div>
    </div>
  ) : activeResultTab === 'summary' ? (
    <SummaryTab result={result} phase={phase} after={!notesBeside && currentHistoryItem && <YourNotesSection meetingId={currentHistoryItem.id} />} />
  ) : activeResultTab === 'related' && currentHistoryItem ? (
    // Keyed by meeting: opening a related meeting starts its tab fresh, at the top.
    <TabPage key={currentHistoryItem.id}>
      <RelatedTab meetingId={currentHistoryItem.id} />
    </TabPage>
  ) : (
    <TabPage>
      <TodoList />
    </TabPage>
  );

  const sheets = (
    <>
      {/* iPhone: + › Note opens the meeting's notes as a screen of their own. */}
      {!notesBeside && currentHistoryItem && (
        <PushedPage open={writingNote} title={MEETING_ADD_COPY.notesTitle} onBack={endCreate} over="app" fill>
          <TranscriptTab meetingId={currentHistoryItem.id} result={result} phase={phase} only="notes" focusNotes />
        </PushedPage>
      )}
      <RenameModal open={sheet === 'rename'} onOpenChange={(open) => !open && setSheet(null)} currentTitle={shownTitle} onConfirm={saveTitle} />
      {currentHistoryItem && (
        <MeetingDetailsDialog meetingId={currentHistoryItem.id} open={sheet === 'details'} onOpenChange={(open) => !open && setSheet(null)} />
      )}
    </>
  );

  return (
    <motion.div
      className="h-full flex flex-col overflow-hidden"
      initial={VIEW.hidden}
      animate={VIEW.shown}
      transition={motionFor(VIEW.enter)}
    >
      {sheets}
      {notesBeside ? (
        <>
          {header}
          {tabs}
          {media}
          {body}
        </>
      ) : (
        // iPhone: one page. The title, its details and the player scroll away; the tabs pin under the bar.
        <PageScroll underTitlebar={false} className="flex flex-1 flex-col">
          {header}
          {media}
          {tabs}
          <TabFlowContext.Provider value>{body}</TabFlowContext.Provider>
        </PageScroll>
      )}
      {itemActions('bottom')}
    </motion.div>
  );
};

export default ResultsView;
