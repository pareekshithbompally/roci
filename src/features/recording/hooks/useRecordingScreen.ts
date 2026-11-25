/** Which recording owns the home column with its record screen, if any. */

import { useSelectedHistoryId } from '@shared/stores/appStore';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useRecordingMeetingId } from '@features/recording/stores/recordingStore';

/** The meeting whose record screen shows: with Live Transcript on, a recording owns the home column; off, the record screen
 *  still shows while that meeting is the one open, so its Pause / Stop are always reachable (a phone has no activity tray). */
export function useRecordingScreenMeetingId(): string | null {
  const selectedHistoryId = useSelectedHistoryId();
  const recordingMeetingId = useRecordingMeetingId();
  const { settings } = useSettings();
  if (recordingMeetingId === null) return null;
  return settings.liveTranscription || selectedHistoryId === recordingMeetingId ? recordingMeetingId : null;
}
