/** The rows every activity surface shows: playing audio first, then each task; queued imports and Cancel all at the foot. */

import React from 'react';
import { Button, Separator, Text } from '@shared/ui';
import { ActivityRow } from './ActivityRow';
import { playbackItem } from './activityModel';
import type { useActivity } from './useActivity';
import type { MinimizedAudio } from './useMinimizedAudio';

interface ActivityListProps {
  activity: ReturnType<typeof useActivity>;
  audio: MinimizedAudio | null;
}

export const ActivityList: React.FC<ActivityListProps> = ({ activity, audio }) => (
  <div>
    {audio && <ActivityRow item={playbackItem(audio)} />}
    {activity.items.map((item, i) => (
      <React.Fragment key={item.id}>
        {(i > 0 || audio) && <Separator className="mx-3" />}
        <ActivityRow item={item} />
      </React.Fragment>
    ))}
    {(activity.queued > 0 || activity.canCancelAll) && (
      <>
        <Separator />
        <div className="flex items-center gap-2 px-3 py-1.5">
          {activity.queued > 0 && <Text variant="caption" tone="muted" className="flex-1">{activity.queued} queued</Text>}
          {activity.canCancelAll && <Button variant="ghost" size="sm" className="ml-auto" onClick={activity.cancelAll}>Cancel all</Button>}
        </div>
      </>
    )}
  </div>
);
