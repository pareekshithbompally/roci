/** Meeting CRUD via the unified store (roci.db). */

import type { MeetingDetail } from '@shared/types';
import { store } from '@services/db';
import { reminderService } from '@services/reminder.service';
import { useAudioPlayerStore } from '@shared/stores/audioPlayerStore';

class MeetingService {
  /** Lazy-load full meeting detail */
  async getMeetingDetail(id: string): Promise<MeetingDetail | null> {
    return store.meetings.get(id);
  }

  /** Deletes a meeting with all it owns in one store write, stops its audio if it is loaded, then removes its owed notices;
   *  throws when the delete fails. */
  async deleteMeeting(id: string): Promise<void> {
    await store.meetings.delete(id);
    useAudioPlayerStore.getState().release(id);
    await reminderService.cancelOwed().catch((error: unknown) =>
      console.warn('[MeetingService] Owed notices left for launch:', error));
  }
}

export const meetingService = new MeetingService();
