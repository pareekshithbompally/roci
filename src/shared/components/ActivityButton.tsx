/** iPhone: beside the sidebar's Settings, a spinner while work runs (downloads, model loads, imports) or meeting audio plays;
 *  tapping it opens Activity in a sheet as tall as its rows. A recording isn't here: its Record pill shows and stops it in place.
 *  The sidebar stays mounted, so meeting audio keeps playing whether Activity is open or not. */

import React, { useState } from 'react';
import { AudioLines, CircleAlert, CircleCheck, Loader2 } from 'lucide-react';
import { Button, Card, CardRow, Icon, InfoSheet, Section } from '@shared/ui';
import { KIT_COPY } from '@config/kitCopy.config';
import { ActivityList } from './activity/ActivityList';
import { activitySummary, isSettled } from './activity/activityModel';
import { useActivity } from './activity/useActivity';
import { useMinimizedAudio } from './activity/useMinimizedAudio';

/** The button's one mark: a spinner only while something runs; once all has settled, ✓ (or ! when one failed); audio alone. */
const Mark: React.FC<{ audioOnly: boolean; running: boolean; failed: boolean }> = ({ audioOnly, running, failed }) => {
  if (audioOnly) return <Icon icon={AudioLines} size="md" />;
  if (running) return <Icon icon={Loader2} size="md" className="animate-spin" />;
  return <Icon icon={failed ? CircleAlert : CircleCheck} size="md" tone={failed ? 'danger' : undefined} />;
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
          <Mark
            audioOnly={audioOnly}
            running={activity.items.some((item) => !isSettled(item))}
            failed={activity.items.some((item) => item.status === 'error')}
          />
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
