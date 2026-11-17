/** iPhone: a capsule under the top bar while anything runs (or meeting audio plays elsewhere); tapping it opens the activity sheet.
 *  Always mounted by the phone shell, so meeting audio keeps playing whether the sheet is open or not. */

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BottomSheet, Button, Dot, Icon, Text } from '@shared/ui';
import { ActivityList } from './activity/ActivityList';
import { activitySummary } from './activity/activityModel';
import { useActivity } from './activity/useActivity';
import { useMinimizedAudio } from './activity/useMinimizedAudio';

export const ActivityCapsule: React.FC = () => {
  const activity = useActivity();
  const audio = useMinimizedAudio();
  const [open, setOpen] = useState(false);
  const count = activity.items.length + (audio ? 1 : 0);
  const recording = activity.items[0]?.type === 'recording';

  const summary = activity.items.length === 0 && audio
    ? audio.title
    : count === activity.items.length ? activitySummary(activity.items) : `${count} tasks`;

  return (
    <>
      {count > 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center px-4">
          <Button variant="bar" size="sm" className="pointer-events-auto max-w-full" onClick={() => setOpen(true)} aria-haspopup="dialog">
            {recording ? <Dot tone="danger" pulse /> : <Icon icon={Loader2} size="xs" className="animate-spin" />}
            <Text as="span" variant="inherit" truncate>{summary}</Text>
          </Button>
        </div>
      )}
      <BottomSheet open={open && count > 0} onOpenChange={setOpen} title="Activity">
        <div className="flex items-center justify-between gap-2 px-4 pb-2">
          <Text as="h2" variant="title">Activity</Text>
          {activity.canClear && <Button variant="outline" size="sm" onClick={activity.clearSettled}>Clear finished</Button>}
        </div>
        <ActivityList activity={activity} audio={audio} />
      </BottomSheet>
    </>
  );
};
