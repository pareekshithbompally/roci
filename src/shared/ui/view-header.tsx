/** A top-level view's header (To-dos, Upcoming, Gallery, Dictations): clear of the titlebar, the title with a quiet line under
 *  it and controls at the row's end, an optional row beneath, a hairline under all of it. One place, so every view's title
 *  sits at the same spot. */

import React from 'react';
import { LAYOUT } from '@config/layout.config';
import { Surface } from './surface';
import { Text } from './text';
import { TitlebarSpacer } from './page-scroll';

export interface ViewHeaderProps {
  title: string;
  /** One quiet line under the title (counts). */
  detail?: React.ReactNode;
  /** Controls at the end of the title row. */
  accessory?: React.ReactNode;
  /** Takes the title's place while it is open (a search field). */
  replaceTitle?: React.ReactNode;
  /** A row under the title row (filters, a day's controls). */
  children?: React.ReactNode;
}

export function ViewHeader({ title, detail, accessory, replaceTitle, children }: ViewHeaderProps) {
  return (
    <>
      <TitlebarSpacer />
      <Surface as="header" edge="bottom" className={`shrink-0 space-y-3 ${LAYOUT.listGutter} ${LAYOUT.viewHeader}`}>
        {/* The title line is one control tall and the controls align to it, so every view's title sits at the same spot
            with or without buttons or a detail line. */}
        <div className="flex items-start gap-2">
          {replaceTitle || (
            <div className="min-w-0 flex-1">
              <div className="flex h-control-sm min-w-0 items-center">
                <Text as="h1" variant="pageTitle" truncate className="min-w-0">{title}</Text>
              </div>
              {detail && <Text as="p" variant="helper" tone="muted">{detail}</Text>}
            </div>
          )}
          {accessory && <div className="flex h-control-sm shrink-0 items-center gap-2">{accessory}</div>}
        </div>
        {children}
      </Surface>
    </>
  );
}
