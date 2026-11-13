/**
 * ProcessingRow — renders a processing-type activity in the tray.
 *
 * Uses ActivityRowLayout for consistent single-line display.
 * Now renders item.actions inline (e.g. cancel button).
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import type { ActivityItem } from '@shared/stores/activityStore';
import { ActivityRowLayout, formatStep } from './ActivityRowLayout';

/** Step counter (e.g. transcription part 2/4) leads the detail when present. */
export const ProcessingRow: React.FC<{ item: ActivityItem }> = ({ item }) => (
  <ActivityRowLayout
    icon={<Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#a855f7' }} />}
    label={item.label}
    detail={[formatStep(item.step), item.detail].filter(Boolean).join(' · ') || null}
    actions={item.actions}
    percent={item.percent}
  />
);
