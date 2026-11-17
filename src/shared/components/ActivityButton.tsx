/** iPhone: beside the sidebar's Settings, a spinner while work runs (downloads, model loads, imports) or meeting audio plays;
 *  tapping it opens Activity full screen. A recording isn't here: its Record pill shows and stops it in place.
 *  The sidebar stays mounted, so meeting audio keeps playing whether Activity is open or not. */

import React, { useState } from 'react';
import { AudioLines, Loader2 } from 'lucide-react';
import { BottomSheet, Button, Icon, Text } from '@shared/ui';
import { ActivityList } from './activity/ActivityList';
import { activitySummary } from './activity/activityModel';
import { useActivity } from './activity/useActivity';
import { useMinimizedAudio } from './activity/useMinimizedAudio';

/** The button's one mark: a spinner while work runs, or audio playing alone. */
const Mark: React.FC<{ audioOnly: boolean }> = ({ audioOnly }) => {
  if (audioOnly) return <Icon icon={AudioLines} size="md" />;
  return <Icon icon={Loader2} size="md" className="animate-spin" />;
};

export const ActivityButton: React.FC = () => {
  const activity = useActivity({ withoutRecording: true });
  const audio = useMinimizedAudio();
  const [open, setOpen] = useState(false);
  const count = activity.items.length + (audio ? 1 : 0);
  const audioOnly = activity.items.length === 0 && !!audio;
  const label = audioOnly && audio ? audio.title : activitySummary(activity.items);

  return (
    <>
      {count > 0 && (
        <Button variant="bar" size="fab" aria-label={`Activity: ${label}`} title={label} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <Mark audioOnly={audioOnly} />
        </Button>
      )}
      <BottomSheet open={open && count > 0} onOpenChange={setOpen} title="Activity" size="full">
        <div className="flex items-center justify-between gap-2 px-4 pb-2">
          <Text as="h2" variant="title">Activity</Text>
          {activity.canClear && <Button variant="outline" size="sm" onClick={activity.clearSettled}>Clear finished</Button>}
        </div>
        <ActivityList activity={activity} audio={audio} />
      </BottomSheet>
    </>
  );
};
