/** iPhone: beside the sidebar's Settings, a spinner while work runs (downloads, model loads, imports) or meeting audio plays;
 *  tapping it opens Activity in a sheet as tall as its rows. A recording isn't here: its Record pill shows and stops it in place.
 *  The sidebar stays mounted, so meeting audio keeps playing whether Activity is open or not. */

import React, { useState } from 'react';
import { AudioLines, Loader2 } from 'lucide-react';
import { Button, Card, CardRow, Icon, InfoSheet, Section } from '@shared/ui';
import { KIT_COPY } from '@config/kitCopy.config';
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
        <Button variant="bar" size="fab" aria-label={KIT_COPY.activity.button(label)} title={label} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <Mark audioOnly={audioOnly} />
        </Button>
      )}
      <InfoSheet open={open && count > 0} onOpenChange={setOpen} title={KIT_COPY.activity.title}>
        <Card><ActivityList activity={activity} audio={audio} /></Card>
        {activity.canClear && (
          <Section>
            <CardRow title={KIT_COPY.clearFinished} tone="accent" onPress={activity.clearSettled} />
          </Section>
        )}
      </InfoSheet>
    </>
  );
};
