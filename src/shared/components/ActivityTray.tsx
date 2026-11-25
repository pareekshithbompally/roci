/** Mac: the activity tray at the sidebar's foot while anything runs (or meeting audio plays elsewhere); collapsible, with Clear. */

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Icon, IconButton, Row, Separator, Surface, Text, motionFor } from '@shared/ui';
import { UI_CONFIG } from '@config/ui.config';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { ActivityList } from './activity/ActivityList';
import { useActivity } from './activity/useActivity';
import { useMinimizedAudio } from './activity/useMinimizedAudio';
import { KIT_COPY } from '@config/kitCopy.config';

const { maxVisibleRows, rowHeight } = UI_CONFIG.activityTray;

export const ActivityTray: React.FC = () => {
  const activity = useActivity();
  const audio = useMinimizedAudio();
  const [collapsed, setCollapsed] = useState(false);
  const count = activity.items.length + (audio ? 1 : 0);

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={motionFor(ANIMATION_CONFIG.activityTray)}
          className="mx-2 mb-1.5 shrink-0 overflow-hidden"
        >
          <Surface variant="card" radius="lg" className="overflow-hidden">
            <div className="flex items-center gap-1 p-1">
              <Row onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} className="flex-1">
                <Text variant="label" className="flex-1">{KIT_COPY.activityCount(count)}</Text>
                <Icon icon={collapsed ? ChevronUp : ChevronDown} size="sm" tone="faint" />
              </Row>
              {activity.canClear && <IconButton icon={X} label={KIT_COPY.clearFinished} size="sm" onClick={activity.clearSettled} />}
            </div>
            {!collapsed && (
              <>
                <Separator />
                <div className="overflow-y-auto overflow-x-hidden" style={{ maxHeight: maxVisibleRows * rowHeight }}>
                  <ActivityList activity={activity} audio={audio} />
                </div>
              </>
            )}
          </Surface>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
