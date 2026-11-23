/** A top-level view's header (To-dos, Upcoming, Gallery, Dictations): clear of the titlebar, the title with a quiet line under
 *  it and controls at the row's end, an optional row beneath. A reading view's header sits in the view column with no rule
 *  (its ViewScroll fades under it); a full-width tool's (Upcoming's grid) spans the view over a hairline. One place, so every
 *  view's title sits at the same spot. */

import React, { createContext, useContext } from 'react';
import { LAYOUT } from '@config/layout.config';
import { Surface } from './surface';
import { Text } from './text';
import { cn } from './utils';
import { TitlebarSpacer } from './page-scroll';
import { BackBar } from './nav-stack';

/** Back to where a place was opened from, supplied by a shell that presents places as pushed pages (iPhone: back to the
 *  sidebar). Absent (a Mac, iPad), a place keeps its large title. */
export const ViewBackContext = createContext<(() => void) | null>(null);

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
  /** A full-width tool (Upcoming's grid): the header spans the view over a hairline instead of sitting in the page column. */
  fullWidth?: boolean;
}

export function ViewHeader({ title, detail, accessory, replaceTitle, children, fullWidth }: ViewHeaderProps) {
  const back = useContext(ViewBackContext);
  if (back) {
    // A pushed page (iPhone): ‹ back, the title centred, the place's controls at the end; its rows (a search, filters) under it.
    return (
      <header className="shrink-0 pt-safe-top">
        <BackBar title={title} onBack={back} action={accessory && <div className="flex items-center gap-1">{accessory}</div>} />
        {(replaceTitle || children) && <div className={cn('space-y-3 pb-3', LAYOUT.listGutter)}>{replaceTitle && <div className="flex items-center gap-2">{replaceTitle}</div>}{children}</div>}
      </header>
    );
  }
  // The title line is one control tall and the controls align to it, so every view's title sits at the same spot with or
  // without buttons or a detail line.
  const rows = (
    <>
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
    </>
  );
  return (
    <>
      <TitlebarSpacer />
      {fullWidth ? (
        <Surface as="header" edge="bottom" className={cn('shrink-0 space-y-3', LAYOUT.listGutter, LAYOUT.viewHeader)}>{rows}</Surface>
      ) : (
        <header className={cn('shrink-0', LAYOUT.pageColumnFrame, LAYOUT.viewHeader)}>
          <div className={cn('space-y-3', LAYOUT.viewColumn, LAYOUT.listGutter)}>{rows}</div>
        </header>
      )}
    </>
  );
}
