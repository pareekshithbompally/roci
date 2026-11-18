/** Record screen: the title, then the clock and controls on their own row; below, the user's notes beside the enhanced notes and
 *  a transcript strip (the last turns, expandable). A phone shows the three as tabs. */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ChevronUp, Pause, Play, Square } from 'lucide-react';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { useSettings } from '@shared/contexts/SettingsContext';
import { Button, Dot, edgeFade, Icon, IconButton, Surface, Tabs, Text, TitlebarSpacer } from '@shared/ui';
import { useFormFactor } from '@platform/formFactor';
import { LAYOUT } from '@config/layout.config';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { META_SEPARATOR } from '@config/ui.config';
import { MEETING_LIVE_CONFIG as LIVE } from '@config/meetingLive.config';
import { LIVE_NOTES_CONFIG as NOTES, LIVE_NOTES_TABS, type LiveNotesTab } from '@config/liveNotes.config';
import { speechSelectionOf } from '@services/ai/transcription';
import { formatClock, recording, recordedSeconds, useRecordingBusy, useRecordingMeetingId, useRecordingPaused, useRecordingStore } from '@features/recording/stores/recordingStore';
import { useMeetingLiveStore } from '@features/recording/live/meetingLiveStore';
import type { LiveEntry } from '@features/recording/live/liveTranscript';
import { EnhancedNotes, PaneLabel, useLiveNotes, YourNotes } from '@features/recording/notes';

const VIEW = ANIMATION_CONFIG.view;

const report = (step: string) => (error: unknown) => console.error(`[RecordingMeetingView] ${step} failed:`, error);

/** The recording's clock, ticking only while it records (a visible clock). */
function useClock(): string {
  const meetingId = useRecordingMeetingId();
  const paused = useRecordingPaused();
  const [, force] = React.useState(0);
  useEffect(() => {
    if (!meetingId || paused) return;
    const timer = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [meetingId, paused]);
  return formatClock(recordedSeconds(useRecordingStore.getState()));
}

/** Consecutive entries from one source read as one turn. */
function turnsOf(entries: LiveEntry[]): LiveEntry[][] {
  return entries.reduce<LiveEntry[][]>((turns, entry) => {
    const last = turns.at(-1);
    if (last && last[0].source === entry.source) last.push(entry);
    else turns.push([entry]);
    return turns;
  }, []);
}

const Turn: React.FC<{ turn: LiveEntry[]; clamp?: boolean }> = ({ turn, clamp }) => (
  <div className="space-y-1">
    <div className="flex items-baseline gap-2">
      <Text variant="label" tone={turn[0].source === 'microphone' ? 'accent' : 'muted'}>{LIVE.speakers[turn[0].source]}</Text>
      {turn[0].timed && <Text variant="figureSmall" tone="faint">{formatClock(Math.floor(turn[0].startMs / 1_000))}</Text>}
    </div>
    <Text as="p" variant="reading" className={clamp ? 'line-clamp-2' : undefined}>{turn.map((e) => e.text).join(' ')}</Text>
  </div>
);

const Controls: React.FC<{ paused: boolean; busy: boolean; beforeStop: () => Promise<void> }> = ({ paused, busy, beforeStop }) => (
  <div className="flex shrink-0 items-center gap-2">
    <Button variant="secondary" size="sm" disabled={busy} onClick={() => void (paused ? recording.resume() : recording.pause()).catch(report('pause'))}>
      <Icon icon={paused ? Play : Pause} size="xs" />
      {paused ? 'Resume' : 'Pause'}
    </Button>
    <Button variant="outline" size="sm" disabled={busy} onClick={() => void beforeStop().catch(report('save notes')).then(() => recording.stop()).catch(report('stop'))}>
      <Icon icon={Square} size="xs" className="fill-current" />
      {busy ? 'Stopping…' : 'Stop'}
    </Button>
  </div>
);

interface TranscriptProps {
  turns: LiveEntry[][];
  empty: string;
  /** Collapsed: the last few turns only, without scrolling. */
  collapsed: boolean;
}

/** The in-call transcript, following the newest turn. */
const Transcript: React.FC<TranscriptProps> = ({ turns, empty, collapsed }) => {
  const reduceMotion = useReducedMotion() ?? false;
  const scrollRef = useRef<HTMLDivElement>(null);
  const shown = collapsed ? turns.slice(-NOTES.collapsedTurns) : turns;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [turns, reduceMotion]);

  if (shown.length === 0) return <Text as="p" variant="body" tone="muted" className="px-4 pb-3">{empty}</Text>;
  if (collapsed) return <div className="space-y-3 px-4 pb-3">{shown.map((turn) => <Turn key={`${turn[0].source}-${turn[0].startMs}`} turn={turn} clamp />)}</div>;
  return (
    <div ref={scrollRef} style={edgeFade({ bottom: 48 })} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-12 space-y-4">
      {shown.map((turn) => <Turn key={`${turn[0].source}-${turn[0].startMs}`} turn={turn} />)}
    </div>
  );
};

/** Mac and iPad: the two note panes side by side over the transcript strip; the strip expands over the panes. */
const Panes: React.FC<{ transcript: TranscriptProps; onType: (text: string) => void; hasModel: boolean }> = ({ transcript, onType, hasModel }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <Surface edge={['top', 'left', 'right']} radius="lg" className="flex h-full min-h-0 flex-col overflow-hidden">
      {!expanded && (
        <div className="flex flex-1 min-h-0">
          <Surface edge="right" className="flex-1 min-w-0"><YourNotes onType={onType} /></Surface>
          <div className="flex-1 min-w-0"><EnhancedNotes hasModel={hasModel} /></div>
        </div>
      )}
      <Surface edge={expanded ? undefined : 'top'} className={expanded ? 'flex flex-1 min-h-0 flex-col' : 'shrink-0'}>
        <PaneLabel trailing={
          <IconButton
            icon={expanded ? ChevronDown : ChevronUp}
            label={expanded ? NOTES.copy.collapse : NOTES.copy.expand}
            size="sm"
            onClick={() => setExpanded((open) => !open)}
          />
        }>
          {NOTES.copy.transcript}
        </PaneLabel>
        <Transcript {...transcript} collapsed={!expanded} />
      </Surface>
    </Surface>
  );
};

/** iPhone: one section at a time, picked with a segmented control. */
const Sections: React.FC<{ transcript: TranscriptProps; onType: (text: string) => void; hasModel: boolean }> = ({ transcript, onType, hasModel }) => {
  const [tab, setTab] = useState<LiveNotesTab>('notes');
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Tabs items={LIVE_NOTES_TABS} value={tab} onValueChange={setTab} label={NOTES.copy.yourNotes} />
      <Surface edge={['top', 'left', 'right']} radius="lg" className="flex flex-1 min-h-0 flex-col overflow-hidden">
        {tab === 'notes' && <YourNotes onType={onType} />}
        {tab === 'enhanced' && <EnhancedNotes hasModel={hasModel} />}
        {tab === 'transcript' && <div className="flex flex-1 min-h-0 flex-col pt-3"><Transcript {...transcript} collapsed={false} /></div>}
      </Surface>
    </div>
  );
};

/** One recording's screen; keyed by the meeting so its notes start fresh for each recording. */
const RecordingScreen: React.FC<{ meetingId: string }> = ({ meetingId }) => {
  const paused = useRecordingPaused();
  const busy = useRecordingBusy();
  const entries = useMeetingLiveStore((s) => s.entries);
  const transcribing = useMeetingLiveStore((s) => s.pending > 0);
  const { settings } = useSettings();
  const { items } = useHistoryData();
  const phone = useFormFactor() === 'phone';
  const clock = useClock();
  const turns = useMemo(() => turnsOf(entries), [entries]);
  const { type, flush, hasModel } = useLiveNotes(meetingId);

  const title = items.find((item) => item.id === meetingId)?.title ?? 'Recording';
  const status = paused ? LIVE.copy.paused : transcribing ? LIVE.copy.transcribing : LIVE.copy.listening;
  const empty = speechSelectionOf(settings) ? LIVE.copy.empty : LIVE.copy.noModel;
  const transcript = { turns, empty, collapsed: true };
  const Body = phone ? Sections : Panes;

  return (
    <motion.div className="h-full flex flex-col overflow-hidden" initial={VIEW.hidden} animate={VIEW.shown} transition={VIEW.enter}>
      <TitlebarSpacer />
      <div className={`${LAYOUT.pageGutter} pt-3 pb-3`}>
        <div className={`${LAYOUT.pageColumn} space-y-2`}>
          <div className="flex min-w-0 items-center gap-2">
            <Dot tone="danger" pulse={!paused && !busy} />
            <Text as="h1" variant="pageTitle" truncate>{title}</Text>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <Text variant="figureSmall" tone="muted">{[clock, status].join(META_SEPARATOR)}</Text>
            <Controls paused={paused} busy={busy} beforeStop={flush} />
          </div>
        </div>
      </div>
      <div className={`${LAYOUT.pageGutter} flex-1 overflow-hidden`}>
        <div className={`${LAYOUT.pageColumn} h-full flex flex-col min-h-0`}>
          <Body transcript={transcript} onType={type} hasModel={hasModel} />
        </div>
      </div>
    </motion.div>
  );
};

export const RecordingMeetingView: React.FC = () => {
  const meetingId = useRecordingMeetingId();
  return meetingId ? <RecordingScreen key={meetingId} meetingId={meetingId} /> : null;
};
