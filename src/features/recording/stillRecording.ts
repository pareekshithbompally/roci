/** "Are you still recording?" every hour of a recording; an ask left unanswered stops and saves it. */

import { onNotificationResponse, postNotice } from '@services/notifications';
import { NOTIFICATIONS_CONFIG } from '@config/notifications.config';
import { recording } from '@features/recording/stores/recordingStore';

const ask = NOTIFICATIONS_CONFIG.recording;
/** Recorded seconds at the last ask, and at the ask still awaiting an answer, per meeting. */
const lastAskedAt = new Map<string, number>();
const pendingAskAt = new Map<string, number>();

const noticeId = (meetingId: string): string => `${ask.idPrefix}${meetingId}`;

function stopUnanswered(meetingId: string, seconds: number): void {
  pendingAskAt.delete(meetingId);
  void postNotice({
    id: noticeId(meetingId),
    title: 'Recording stopped',
    body: `No answer after ${Math.floor(seconds / 60)} minutes, so Roci stopped and saved it.`,
  });
  recording.stop().catch((error: unknown) => console.error('[stillRecording] Auto-stop failed:', error));
}

/** Per recording tick. */
export function checkStillRecording(meetingId: string, seconds: number): void {
  const askedAt = pendingAskAt.get(meetingId);
  if (askedAt !== undefined) {
    if (seconds >= askedAt + ask.autoStopAfterSeconds) stopUnanswered(meetingId, seconds);
    return;
  }
  if (seconds < (lastAskedAt.get(meetingId) ?? 0) + ask.askEverySeconds) return;
  lastAskedAt.set(meetingId, seconds);
  pendingAskAt.set(meetingId, seconds);
  void postNotice({
    id: noticeId(meetingId),
    title: 'Are you still recording?',
    body: `Recording for ${Math.floor(seconds / 60)} minutes. It stops in ${ask.autoStopAfterSeconds / 60} minutes unless you keep it going.`,
    category: ask.category,
    userInfo: { sessionId: meetingId },
  });
}

/** Answers from the notification (Keep recording / Stop now); returns the unsubscribe. */
export function listenForStillRecordingAnswers(): () => void {
  return onNotificationResponse(({ id, action, userInfo }) => {
    const meetingId = userInfo.sessionId;
    if (!id.startsWith(ask.idPrefix) || !meetingId) return;
    pendingAskAt.delete(meetingId);
    if (action === ask.actions.stop) {
      recording.stop().catch((error: unknown) => console.error('[stillRecording] Stop failed:', error));
    }
  });
}
