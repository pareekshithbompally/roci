/** The page a meeting's Summary, To-dos and Related tabs scroll in: under the tabs, clear of the meeting chat, at least as
 *  tall as the pane, so an empty state centres in the same place on every tab. */

import React from 'react';
import { FadeScroll, cn } from '@shared/ui';
import { LAYOUT } from '@config/layout.config';

export const TabPage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <FadeScroll fill className={cn('flex-1 pt-4', LAYOUT.pageGutter, LAYOUT.meetingChatClearance)}>
    <div className={cn(LAYOUT.pageColumn, 'flex flex-1 flex-col gap-6')}>{children}</div>
  </FadeScroll>
);
