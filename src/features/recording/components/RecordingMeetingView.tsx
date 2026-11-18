/** Record screen: the title, then the clock and controls on their own row; below, the live transcript on the left and the notes
 *  (Your notes or AI notes, one at a time) on the right. A phone shows the three as tabs. */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Pause, Play, Square } from 'lucide-react';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { useSettings } from '@shared/contexts/SettingsContext';
import { Button, Dot, Icon, Surface, Tabs, Text, TitlebarSpacer } from '@shared/ui';
import { useFormFactor } from '@platform/formFactor';
import { LAYOUT } from '@config/layout.config';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { META_SEPARATOR } from '@config/ui.config';
import { MEETING_LIVE_CONFIG as LIVE } from '@config/meetingLive.config';
import { LIVE_NOTES_CONFIG as NOTES, type PhoneSection } from '@config/liveNotes.config';
import { speechSelectionOf } from '@services/ai/transcription';
import { formatClock, recording, recordedSeconds, useRecordingBusy, useRecordingMeetingId, useRecordingPaused, useRecordingStore } from '@features/recording/stores/recordingStore';
import { useMeetingLiveStore } from '@features/recording/live/meetingLiveStore';
import type { LiveEntry } from '@features/recording/live/liveTranscript';
import { AiNotes, EmptyLine, EnhancingStatus, NotesPane, PaneHeader, useLiveNotes, YourNotes } from '@features/recording/notes';

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

const Turn: React.FC<{ turn: LiveEntry[] }> = ({ turn }) => (
  <div className="space-y-1">
    <div className="flex items-baseline gap-2">
      <Text variant="label" tone={turn[0].source === 'microphone' ? 'accent' : 'muted'}>{LIVE.speakers[turn[0].source]}</Text>
      {turn[0].timed && <Text variant="figureSmall" tone="faint">{formatClock(Math.floor(turn[0].startMs / 1_000))}</Text>}
    </div>
    <Text as="p" variant="reading">{turn.map((e) => e.text).join(' ')}</Text>
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
  /** A chunk is being transcribed: a shimmering line waits under the last turn. */
  transcribing: boolean;
}

/** The in-call transcript, scrolling inside its pane and following the newest turn unless the reader scrolled back. */
const Transcript: React.FC<TranscriptProps> = ({ turns, empty, transcribing }) => {
  const reduceMotion = useReducedMotion() ?? false;
  const scrollRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);

  useEffect(() => {
    if (following.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [turns, transcribing, reduceMotion]);

  const onScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    following.current = scrollHeight - scrollTop - clientHeight <= NOTES.followSlackPx;
  };

  return (
    <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-4 space-y-4">
      {turns.length === 0 && !transcribing && <EmptyLine>{empty}</EmptyLine>}
      {turns.map((turn) => <Turn key={`${turn[0].source}-${turn[0].startMs}`} turn={turn} />)}
      {transcribing && <Text as="p" variant="reading" shimmer>{NOTES.copy.transcribing}</Text>}
    </div>
  );
};

const TranscriptPane: React.FC<TranscriptProps> = (props) => (
  <section className="flex h-full min-h-0 flex-col">
    <PaneHeader><Text variant="label" tone="muted">{NOTES.copy.transcript}</Text></PaneHeader>
    <Transcript {...props} />
  </section>
);

interface BodyProps {
  transcript: TranscriptProps;
  onType: (text: string) => void;
  hasModel: boolean;
}

/** Mac and iPad: the transcript on the left, the notes on the right; each pane scrolls inside itself, the screen never does. */
const Columns: React.FC<BodyProps> = ({ transcript, onType, hasModel }) => (
  <Surface edge={['top', 'left', 'right']} radius="lg" className="grid h-full min-h-0 grid-cols-2 overflow-hidden">
    <Surface edge="right" className="min-h-0 min-w-0"><TranscriptPane {...transcript} /></Surface>
    <div className="min-h-0 min-w-0"><NotesPane onType={onType} hasModel={hasModel} /></div>
  </Surface>
);

const PHONE_TABS = [
  { value: 'transcript' as const, label: NOTES.copy.transcript },
  { value: 'notes' as const, label: NOTES.copy.yourNotes },
  { value: 'ai' as const, label: NOTES.copy.aiNotes },
];

/** iPhone: one section at a time, picked with a segmented control. */
const Sections: React.FC<BodyProps> = ({ transcript, onType, hasModel }) => {
  const [section, setSection] = useState<PhoneSection>('transcript');
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Tabs items={PHONE_TABS} value={section} onValueChange={setSection} label={NOTES.copy.sections} />
      <EnhancingStatus />
      <Surface edge={['top', 'left', 'right']} radius="lg" className="flex flex-1 min-h-0 flex-col overflow-hidden pt-3">
        {section === 'transcript' && <Transcript {...transcript} />}
        {section === 'notes' && <YourNotes onType={onType} />}
        {section === 'ai' && <AiNotes hasModel={hasModel} />}
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
  const transcript = { turns, empty, transcribing: transcribing && !paused };
  const Body = phone ? Sections : Columns;

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
