/** Record screen: the title, then the clock, one status and the controls; below, the meeting's workspace (live transcript
 *  beside the notes) — the same view the meeting keeps as its Transcript tab after Stop. */

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Pause, Play, Square } from 'lucide-react';
import { useMeetingBrief } from '@shared/hooks/useMeetings';
import { useSettings } from '@shared/contexts/SettingsContext';
import { Button, Icon, Text, TitlebarSpacer } from '@shared/ui';
import { MeetingStatus } from '@shared/components';
import type { MeetingPhase } from '@shared/types/meetingPhase';
import { LAYOUT } from '@config/layout.config';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { META_SEPARATOR } from '@config/ui.config';
import { MEETING_LIVE_CONFIG as LIVE } from '@config/meetingLive.config';
import { LIVE_NOTES_CONFIG as NOTES } from '@config/liveNotes.config';
import { speechSelectionOf } from '@services/ai/transcription';
import { formatClock, recording, recordedSeconds, useRecordingBusy, useRecordingMeetingId, useRecordingPaused, useRecordingStore } from '@features/recording/stores/recordingStore';
import { useDraftSegments, useMeetingLiveStore } from '@features/recording/live';
import { useLiveNotes, useLiveNotesStore } from '@features/recording/notes';
import { MeetingWorkspace, type WorkspaceTranscript } from './MeetingWorkspace';

const VIEW = ANIMATION_CONFIG.view;
const RECORDING: MeetingPhase = { kind: 'recording' };

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

/** One recording's screen; keyed by the meeting so its notes start fresh for each recording. */
const RecordingScreen: React.FC<{ meetingId: string }> = ({ meetingId }) => {
  const paused = useRecordingPaused();
  const busy = useRecordingBusy();
  const segments = useDraftSegments(meetingId);
  const failed = useMeetingLiveStore((s) => s.failed);
  const reason = useMeetingLiveStore((s) => s.reason);
  const partial = useMeetingLiveStore((s) => s.partial);
  // a streaming model's words still being revised wait under the last line, faint, until they settle
  const drafting = Object.values(partial).filter(Boolean).join(' ');
  const bullets = useLiveNotesStore((s) => s.bullets);
  const updating = useLiveNotesStore((s) => s.updating);
  const { settings } = useSettings();
  const meeting = useMeetingBrief(meetingId);
  const clock = useClock();
  const { type, flush, modelProblem } = useLiveNotes(meetingId, true);

  const title = meeting?.title ?? 'Recording';
  const transcript: WorkspaceTranscript = {
    label: NOTES.copy.liveTranscript,
    segments,
    notice: failed ? [LIVE.copy.unavailable, reason].filter(Boolean).join(' ') : undefined,
    empty: speechSelectionOf(settings) ? LIVE.copy.empty : LIVE.copy.noModel,
    footer: drafting || undefined,
    follow: true,
  };

  return (
    <motion.div className="h-full flex flex-col overflow-hidden" initial={VIEW.hidden} animate={VIEW.shown} transition={VIEW.enter}>
      <TitlebarSpacer />
      <div className={`${LAYOUT.pageGutter} pt-3 pb-3`}>
        <div className={`${LAYOUT.pageColumn} space-y-2`}>
          <div className="flex min-w-0 items-center gap-2">
            <Text as="h1" variant="pageTitle" truncate>{title}</Text>
            <MeetingStatus phase={RECORDING} display="badge" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <Text variant="figureSmall" tone="muted">{[clock, paused && LIVE.copy.paused].filter(Boolean).join(META_SEPARATOR)}</Text>
            <Controls paused={paused} busy={busy} beforeStop={flush} />
          </div>
        </div>
      </div>
      <div className={`${LAYOUT.pageGutter} flex-1 overflow-hidden`}>
        <div className={`${LAYOUT.pageColumn} h-full flex flex-col min-h-0`}>
          <MeetingWorkspace
            transcript={transcript}
            notes={{ onType: type, modelProblem, bullets, writing: updating, live: true, initialView: 'notes' }}
          />
        </div>
      </div>
    </motion.div>
  );
};

export const RecordingMeetingView: React.FC = () => {
  const meetingId = useRecordingMeetingId();
  return meetingId ? <RecordingScreen key={meetingId} meetingId={meetingId} /> : null;
};
