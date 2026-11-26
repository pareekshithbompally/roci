/** One activity row, any kind: its mark, label, detail line, progress and own actions; built from kit parts only. */

import React from 'react';
import {
  Clock, Download, ExternalLink, Pause, Play, RefreshCw, SkipForward, Sparkles, Square, X,
  type LucideIcon,
} from 'lucide-react';
import { IconButton, Progress, StateMark, Text } from '@shared/ui';
import type { ActivityAction, ActivityItem } from '@shared/stores/activityStore';
import { activityDetail, activityState } from './activityModel';

/** The store names an action by its icon; each name's glyph, and whether it draws filled. */
const ACTION_GLYPH: Record<string, { icon: LucideIcon; filled?: boolean }> = {
  pause: { icon: Pause, filled: true },
  play: { icon: Play, filled: true },
  'skip-forward': { icon: SkipForward },
  square: { icon: Square, filled: true },
  clock: { icon: Clock },
  sparkles: { icon: Sparkles },
  'refresh-cw': { icon: RefreshCw },
  download: { icon: Download },
  'external-link': { icon: ExternalLink },
  x: { icon: X },
};



const Actions: React.FC<{ actions: ActivityAction[] }> = ({ actions }) => (
  <div className="flex shrink-0 items-center">
    {actions.map((action) => {
      const glyph = ACTION_GLYPH[action.icon];
      if (!glyph) return null;
      return (
        <IconButton
          key={action.icon}
          icon={glyph.icon}
          filled={glyph.filled}
          label={action.label}
          size="sm"
          variant={action.icon === 'square' ? 'dangerGhost' : 'ghost'}
          onClick={action.onClick}
        />
      );
    })}
  </div>
);

export const ActivityRow: React.FC<{ item: ActivityItem }> = ({ item }) => {
  const detail = activityDetail(item);
  return (
    <div className="flex items-start gap-2.5 px-3 py-2">
      <Text as="span" variant="label" className="flex h-[1lh] w-4 shrink-0 items-center justify-center">
        <StateMark state={activityState(item)} />
      </Text>
      <div className="min-w-0 flex-1 space-y-1">
        <Text as="p" variant="label" truncate>{item.label}</Text>
        {detail && <Text as="p" variant="caption" tone="muted" truncate>{detail}</Text>}
        {item.percent !== null && item.status === 'active' && <Progress percent={item.percent} />}
      </div>
      {item.actions.length > 0 && <Actions actions={item.actions} />}
    </div>
  );
};
