/** The page a meeting's Summary, To-dos and Related tabs scroll in: under the tabs, clear of the meeting's +, at least as
 *  tall as the pane, so an empty state centres in the same place on every tab. Inside a page that already scrolls (iPhone's
 *  one-page meeting, `TabFlowContext`) it flows in it instead. */

import React, { createContext, useContext } from 'react';
import { FadeScroll, cn } from '@shared/ui';
import { LAYOUT } from '@config/layout.config';

/** The meeting screen scrolls as one page (iPhone): its tabs flow in it rather than scrolling themselves. */
export const TabFlowContext = createContext(false);

export const TabPage: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const column = <div className={cn(LAYOUT.pageColumn, 'flex flex-1 flex-col gap-6')}>{children}</div>;
  if (useContext(TabFlowContext)) return <div className={cn('pt-4', LAYOUT.pageGutter, LAYOUT.fabClearance)}>{column}</div>;
  return <FadeScroll fill className={cn('flex-1 pt-4', LAYOUT.pageGutter, LAYOUT.fabClearance)}>{column}</FadeScroll>;
};
