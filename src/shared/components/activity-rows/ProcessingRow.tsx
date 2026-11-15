/** A processing activity in the tray, with its actions (e.g. cancel) inline. */

import React from 'react';
import { Loader2 } from 'lucide-react';
import type { ActivityItem } from '@shared/stores/activityStore';
import { ActivityRowLayout, formatStep } from './ActivityRowLayout';

/** Step counter (e.g. transcription part 2/4) leads the detail when present. */
export const ProcessingRow: React.FC<{ item: ActivityItem }> = ({ item }) => (
  <ActivityRowLayout
    icon={<Loader2 className="w-3.5 h-3.5 animate-spin text-ai" />}
    label={item.label}
    detail={[formatStep(item.step), item.detail].filter(Boolean).join(' · ') || null}
    actions={item.actions}
    percent={item.percent}
  />
);
