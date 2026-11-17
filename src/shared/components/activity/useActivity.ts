/** The activity list every surface shows (Mac tray, iPhone sheet): sorted rows and the actions on all of them. */

import { useMemo } from 'react';
import { activityStore, useActivityItems } from '@shared/stores/activityStore';
import { isSettled, sortActivity } from './activityModel';

/** The detail a queued import carries until it starts. */
const QUEUED = 'Queued';

/** `withoutRecording`: for a surface beside the Record pill, which already shows and stops the recording. */
export function useActivity({ withoutRecording = false } = {}) {
  const items = useActivityItems();
  const sorted = useMemo(
    () => sortActivity(withoutRecording ? items.filter((i) => i.type !== 'recording') : items),
    [items, withoutRecording],
  );
  const settled = sorted.filter(isSettled);
  const queued = sorted.filter((i) => i.detail === QUEUED).length;
  const cancellable = sorted.filter((i) => i.actions.some((a) => a.icon === 'x'));

  return {
    items: sorted,
    queued,
    canClear: settled.length > 0,
    canCancelAll: cancellable.length > 1,
    /** Removes every finished, failed or cancelled row. */
    clearSettled: () => settled.forEach((i) => activityStore.remove(i.id)),
    /** Runs each row's own Cancel. */
    cancelAll: () => cancellable.forEach((i) => i.actions.find((a) => a.icon === 'x')?.onClick()),
  };
}
