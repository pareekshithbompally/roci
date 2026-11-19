/** Every note and to-do write tells search which meeting changed; loaded on use, since search itself reads the store. */

export function meetingEdited(meetingId: string | null | undefined): void {
  if (!meetingId) return;
  import('@services/searchIndexing.service')
    .then(({ searchIndexingService }) => searchIndexingService.meetingEdited(meetingId))
    .catch((error: unknown) => console.error('[store] Could not schedule search re-indexing:', meetingId, error));
}
