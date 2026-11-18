/** Record screen: the title, then the clock and controls on their own row, then the in-call transcript labelled by who spoke. */

import React, { useEffect, useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Pause, Play, Square } from 'lucide-react';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { useSettings } from '@shared/contexts/SettingsContext';
import { Button, Dot, edgeFade, Icon, Surface, Text, TitlebarSpacer } from '@shared/ui';
import { LAYOUT } from '@config/layout.config';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { META_SEPARATOR } from '@config/ui.config';
import { MEETING_LIVE_CONFIG as LIVE } from '@config/meetingLive.config';
import { speechSelectionOf } from '@services/ai/transcription';
import { formatClock, recording, recordedSeconds, useRecordingBusy, useRecordingMeetingId, useRecordingPaused, useRecordingStore } from '@features/recording/stores/recordingStore';
import { useMeetingLiveStore } from '@features/recording/live/meetingLiveStore';
import type { LiveEntry } from '@features/recording/live/liveTranscript';

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

const Controls: React.FC<{ paused: boolean; busy: boolean }> = ({ paused, busy }) => (
  <div className="flex shrink-0 items-center gap-2">
    <Button variant="secondary" size="sm" disabled={busy} onClick={() => void (paused ? recording.resume() : recording.pause()).catch(report('pause'))}>
      <Icon icon={paused ? Play : Pause} size="xs" />
      {paused ? 'Resume' : 'Pause'}
    </Button>
    <Button variant="outline" size="sm" disabled={busy} onClick={() => void recording.stop().catch(report('stop'))}>
      <Icon icon={Square} size="xs" className="fill-current" />
      {busy ? 'Stopping…' : 'Stop'}
    </Button>
  </div>
);

export const RecordingMeetingView: React.FC = () => {
  const meetingId = useRecordingMeetingId();
  const paused = useRecordingPaused();
  const busy = useRecordingBusy();
  const entries = useMeetingLiveStore((s) => s.entries);
  const transcribing = useMeetingLiveStore((s) => s.pending > 0);
  const { settings } = useSettings();
  const { items } = useHistoryData();
  const reduceMotion = useReducedMotion() ?? false;
  const clock = useClock();
  const scrollRef = useRef<HTMLDivElement>(null);
  const turns = useMemo(() => turnsOf(entries), [entries]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [entries, reduceMotion]);

  if (!meetingId) return null;
  const title = items.find((item) => item.id === meetingId)?.title ?? 'Recording';
  const hasModel = !!speechSelectionOf(settings);
  const status = paused ? LIVE.copy.paused : transcribing ? LIVE.copy.transcribing : LIVE.copy.listening;
  const empty = hasModel ? LIVE.copy.empty : LIVE.copy.noModel;

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
            <Controls paused={paused} busy={busy} />
          </div>
        </div>
      </div>
      <div className={`${LAYOUT.pageGutter} flex-1 overflow-hidden`}>
        <div className={`${LAYOUT.pageColumn} h-full flex flex-col min-h-0`}>
          <Surface edge={['top', 'left', 'right']} radius="lg" className="flex-1 min-h-0 overflow-hidden">
            <div ref={scrollRef} style={edgeFade({ bottom: 48 })} className="h-full overflow-y-auto custom-scrollbar px-4 pt-3 pb-12 space-y-4">
              {turns.length > 0
                ? turns.map((turn) => <Turn key={`${turn[0].source}-${turn[0].startMs}`} turn={turn} />)
                : <Text as="p" variant="body" tone="muted">{empty}</Text>}
            </div>
          </Surface>
        </div>
      </div>
    </motion.div>
  );
};
