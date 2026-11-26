/** The meeting whose page is on screen (its record screen, or its page after Stop), else null: what a meeting's + and its
 *  chat belong to. Other destinations keep a meeting selected underneath, so they count as none. */

import { useAppStatus, useCurrentView, useSelectedHistoryId } from '@shared/stores/appStore';
import { useRecordingScreenMeetingId } from '@features/recording';
import { AppStatus } from '@shared/types';

export function useMeetingOnScreen(): { meetingId: string | null; recording: boolean } {
  const status = useAppStatus();
  const selectedHistoryId = useSelectedHistoryId();
  const home = useCurrentView() === 'home';
  const recordingId = useRecordingScreenMeetingId();
  if (!home) return { meetingId: null, recording: false };
  if (recordingId) return { meetingId: recordingId, recording: true };
  return { meetingId: status === AppStatus.RESULTS ? selectedHistoryId : null, recording: false };
}
