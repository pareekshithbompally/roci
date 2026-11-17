/** The one way into To-dos: a sidebar row above Recents (Mac column, iPhone sheet), selected while To-dos is open. */

import React from 'react';
import { ListTodo } from 'lucide-react';
import { Icon, Row } from '@shared/ui';
import { useAppActions, useCurrentView } from '@shared/stores/appStore';
import { useLeftPanel } from '@shared/hooks/useLeftPanel';
import { useSmallScreen } from '@shared/hooks/useMediaQuery';
import { endSidebarSearch } from '@shared/stores/sidebarSearchStore';
import { TODOS_CONFIG } from '@config/todos.config';

export const TodosRow: React.FC = () => {
  const current = useCurrentView() === 'reminders';
  const { setCurrentView } = useAppActions();
  const setLeftPanel = useLeftPanel((s) => s.setLeftPanel);
  const smallScreen = useSmallScreen();

  const open = () => {
    setCurrentView('reminders');
    endSidebarSearch();
    if (smallScreen) setLeftPanel(false);
  };

  return (
    <Row selected={current} aria-current={current ? 'page' : undefined} onClick={open}>
      <Icon icon={ListTodo} size="xs" className="shrink-0" />
      <span className="flex-1 truncate">{TODOS_CONFIG.title}</span>
    </Row>
  );
};
