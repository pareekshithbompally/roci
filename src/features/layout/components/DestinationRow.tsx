/** A sidebar row that opens one of the app's own places (To-dos, Upcoming): the one way in, selected while that place is open. */

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Icon, Row } from '@shared/ui';
import { useAppActions, useCurrentView, type ViewType } from '@shared/stores/appStore';
import { useLeftPanel } from '@shared/hooks/useLeftPanel';
import { useSmallScreen } from '@shared/hooks/useMediaQuery';
import { endSearch } from '@shared/stores/searchStore';

interface DestinationRowProps {
  view: Exclude<ViewType, 'home' | 'settings'>;
  icon: LucideIcon;
  label: string;
}

export const DestinationRow: React.FC<DestinationRowProps> = ({ view, icon, label }) => {
  const current = useCurrentView() === view;
  const { setCurrentView } = useAppActions();
  const setLeftPanel = useLeftPanel((s) => s.setLeftPanel);
  const smallScreen = useSmallScreen();

  const open = () => {
    setCurrentView(view);
    endSearch();
    if (smallScreen) setLeftPanel(false);
  };

  return (
    <Row selected={current} aria-current={current ? 'page' : undefined} onClick={open}>
      <Icon icon={icon} size="xs" className="shrink-0" />
      <span className="flex-1 truncate">{label}</span>
    </Row>
  );
};
