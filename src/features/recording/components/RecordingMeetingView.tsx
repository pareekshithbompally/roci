/** Record screen: the title, then the clock, one status and the controls; below, the meeting's workspace (live transcript
 *  beside the notes) — the same view the meeting keeps as its Transcript tab after Stop. */

import React from 'react';
import { motion } from 'framer-motion';
import { Clock, Pause, Play, Square } from 'lucide-react';
import { useMeetingBrief } from '@shared/hooks/useMeetings';
import { useSettings } from '@shared/contexts/SettingsContext';
import { IconButton, Text, TitlebarSpacer } from '@shared/ui';
import { MeetingStatus, ModelCreditLine } from '@shared/components';
import type { MeetingPhase } from '@shared/types/meetingPhase';
import { LAYOUT } from '@config/layout.config';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { MEETING_LIVE_CONFIG as LIVE } from '@config/meetingLive.config';
import { LIVE_NOTES_CONFIG as NOTES } from '@config/liveNotes.config';
import { speechSelectionOf } from '@services/ai/transcription';
import { recording, useRecordingBusy, useRecordingMeetingId, useRecordingPaused } from '@features/recording/stores/recordingStore';
import { useRecordingClock } from '@features/recording/hooks';
import { useDraftSegments, useMeetingLiveStore } from '@features/recording/live';
import { useLiveNotes, useLiveNotesStore } from '@features/recording/notes';
import { MeetingWorkspace, type WorkspaceTranscript } from './MeetingWorkspace';

const VIEW = ANIMATION_CONFIG.view;
const RECORDING: MeetingPhase = { kind: 'recording' };
const PAUSED: MeetingPhase = { kind: 'paused' };

const report = (step: string) => (error: unknown) => console.error(`[RecordingMeetingView] ${step} failed:`, error);

/** One form for every control (Voice Memos): same-size filled round buttons named on hover, transport glyphs solid, colour
 *  the only difference: Stop in the Recording badge's red, Resume in the accent as the next step while paused, the rest neutral. */
const Controls: React.FC<{ paused: boolean; busy: boolean; beforeStop: () => Promise<void> }> = ({ paused, busy, beforeStop }) => (
  <div className="flex shrink-0 items-center gap-2">
    <IconButton
      icon={paused ? Play : Pause}
      filled
      label={paused ? LIVE.copy.resume : LIVE.copy.pause}
      size="sm"
      variant={paused ? 'accentTint' : 'secondary'}
      disabled={busy}
      onClick={() => void (paused ? recording.resume() : recording.pause()).catch(report('pause'))}
    />
    {/* Offered once paused: keep the audio and transcribe later, instead of now. */}
    {paused && (
      <IconButton
        icon={Clock}
        label={LIVE.copy.saveForLater}
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => void beforeStop().catch(report('save notes')).then(() => recording.stop(true)).catch(report('save for later'))}
      />
    )}
    <IconButton
      icon={Square}
      filled
      label={busy ? LIVE.copy.stopping : LIVE.copy.stop}
      size="sm"
      variant="dangerTint"
      disabled={busy}
      onClick={() => void beforeStop().catch(report('save notes')).then(() => recording.stop()).catch(report('stop'))}
    />
  </div>
);

/** One recording's screen; keyed by the meeting so its notes start fresh for each recording. */
const RecordingScreen: React.FC<{ meetingId: string }> = ({ meetingId }) => {
  const paused = useRecordingPaused();
  const busy = useRecordingBusy();
  const segments = useDraftSegments(meetingId);
  const reason = useMeetingLiveStore((s) => s.reason);
  const partial = useMeetingLiveStore((s) => s.partial);
  // a streaming model's words still being revised wait under the last line, faint, until they settle
  const drafting = Object.values(partial).filter(Boolean).join(' ');
  const bullets = useLiveNotesStore((s) => s.bullets);
  const updating = useLiveNotesStore((s) => s.updating);
  const { settings } = useSettings();
  const meeting = useMeetingBrief(meetingId);
  const clock = useRecordingClock();
  const { type, flush, modelProblem, model } = useLiveNotes(meetingId, true);
  const speech = speechSelectionOf(settings);

  const title = meeting?.title ?? 'Recording';
  const transcript: WorkspaceTranscript = {
    label: NOTES.copy.liveTranscript,
    segments,
    // a reason means the live transcript stopped; without one it only fell behind or missed a chunk, and carries on
    notice: reason ? `${LIVE.copy.unavailable} ${reason}` : undefined,
    empty: reason ? '' : speechSelectionOf(settings) ? LIVE.copy.empty : LIVE.copy.noModel,
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
            <MeetingStatus phase={paused ? PAUSED : RECORDING} display="badge" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
              <Text variant="figureSmall" tone="muted">{clock}</Text>
              <ModelCreditLine
                credits={[
                  { label: LIVE.copy.transcribing, credit: speech?.model ? { provider: speech.provider, model: speech.model } : null },
                  { label: LIVE.copy.summarizing, credit: model ? { provider: model.provider, model: model.modelId } : null },
                ]}
              />
            </div>
            <Controls paused={paused} busy={busy} beforeStop={flush} />
          </div>
        </div>
      </div>
      <div className={`${LAYOUT.pageGutter} flex-1 overflow-hidden`}>
        <div className={`${LAYOUT.pageColumn} h-full flex flex-col min-h-0`}>
          <MeetingWorkspace
            transcript={transcript}
            notes={{ onType: type, modelProblem, bullets, writing: updating, live: true }}
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
