/** The one recording control: Record, then "Recording · 01:14" in the same place; tapping it stops and it returns to Record. */

import React from 'react';
import { Square } from 'lucide-react';
import { Button, Dot, Icon } from '@shared/ui';
import { isTauriEnvironment } from '@services/tauri';
import { recording, useRecordingBusy, useRecordingMeetingId } from '@features/recording/stores/recordingStore';
import { useRecordingClock, useStartRecording } from '@features/recording/hooks';
import { MEETING_LIVE_CONFIG as LIVE } from '@config/meetingLive.config';
import { meetingPhaseLabel } from '@config/meetingPhase.config';

const RECORDING = { kind: 'recording' } as const;

const report = (step: string) => (error: unknown) => console.error(`[RecordPill] ${step} failed:`, error);

export const RecordPill: React.FC = () => {
  const start = useStartRecording();
  const meetingId = useRecordingMeetingId();
  const busy = useRecordingBusy();
  const clock = useRecordingClock();

  if (!meetingId) {
    return (
      <Button variant="outline" size="sm" onClick={() => void start().catch(report('start'))} disabled={busy || !isTauriEnvironment()}>
        <Dot tone="danger" />
        Record
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" className="tabular-nums" onClick={() => void recording.stop().catch(report('stop'))} disabled={busy} aria-label="Stop recording">
      <Dot tone="danger" pulse={!busy} />
      {busy ? LIVE.copy.stopping : [meetingPhaseLabel(RECORDING), clock].filter(Boolean).join(' · ')}
      {!busy && <Icon icon={Square} size="xs" className="fill-current" />}
    </Button>
  );
};
