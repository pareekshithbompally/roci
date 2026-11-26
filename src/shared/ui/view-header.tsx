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
import { TopBar } from './top-bar';
import { PrimaryAction, type PrimaryActionSpec } from './primary-action';

/** The top bar's leading control, supplied by a shell that shows each place full screen with its own bar (iPhone: the
 *  sidebar button, as on home). Absent (a Mac, iPad), a place keeps its large title. A place is a top-level screen, so it
 *  never has ‹; only what is opened from it does. */
export const ViewLeadingContext = createContext<React.ReactNode>(null);

export interface ViewHeaderProps {
  title: string;
  /** One quiet line under the title (counts). */
  detail?: React.ReactNode;
  /** Controls at the end of the title row. */
  accessory?: React.ReactNode;
  /** The place's one primary action: last in the title row on a Mac, the floating button on iPhone. */
  primaryAction?: PrimaryActionSpec;
  /** Takes the title's place while it is open (a search field). */
  replaceTitle?: React.ReactNode;
  /** A row under the title row (filters, a day's controls). */
  children?: React.ReactNode;
  /** A full-width tool (Upcoming's grid): the header spans the view over a hairline instead of sitting in the page column. */
  fullWidth?: boolean;
}

export function ViewHeader({ title, detail, accessory: controls, primaryAction, replaceTitle, children, fullWidth }: ViewHeaderProps) {
  const accessory = primaryAction ? <>{controls}<PrimaryAction action={primaryAction} /></> : controls;
  const leading = useContext(ViewLeadingContext);
  if (leading) {
    // iPhone: the shell's top bar (the sidebar button, the title centred, the place's controls at the end); its rows (a
    // search, filters) under it.
    return (
      <>
        <TopBar leading={leading} title={title} trailing={accessory} />
        {(replaceTitle || children) && <div className={cn('shrink-0 space-y-3 pb-3', LAYOUT.listGutter)}>{replaceTitle && <div className="flex items-center gap-2">{replaceTitle}</div>}{children}</div>}
      </>
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
