/** Notes for the meeting currently selected in the app store. */

import { useSelectedHistoryId } from '@shared/stores/appStore';
import { useMeetingNotes } from './useMeetingNotes';

export const useNotes = () => {
  const meetingId = useSelectedHistoryId();
  return useMeetingNotes(meetingId);
};

export default useNotes;
