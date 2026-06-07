/**
 * useNotes Hook
 *
 * Main hook for accessing notes functionality.
 * Backed by TanStack Query via useMeetingNotes.
 * Self-sources the current meeting ID from the app store.
 */

import { useSelectedHistoryId } from '@shared/stores/appStore';
import { useMeetingNotes } from './useMeetingNotes';

export const useNotes = () => {
  const meetingId = useSelectedHistoryId();
  return useMeetingNotes(meetingId);
};

export default useNotes;
