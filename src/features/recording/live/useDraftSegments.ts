/** The in-call transcript of a meeting as stored segments: what the record screen shows, and the meeting's draft transcript
 *  after Stop until the final one is saved; the same formatting as the saved transcript, so nothing shifts when it lands. */

import { useMemo } from 'react';
import { formatTranscript } from '@services/ai/transcription';
import type { StoredTranscriptSegment } from '@shared/types';
import { liveTranscriptResult } from './liveTranscript';
import { useDraftEntries } from './meetingLiveStore';

export function useDraftSegments(meetingId: string | null): StoredTranscriptSegment[] {
  const entries = useDraftEntries(meetingId);
  return useMemo(() => formatTranscript(liveTranscriptResult(entries)).segments, [entries]);
}
