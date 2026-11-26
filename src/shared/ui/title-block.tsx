/** A meeting's header, recording or finished: clear of the titlebar, in the page column: the title line, then its meta line
 *  (date, details). Its `status` and `accessory` (the ⋯ menu) end the title line on a Mac. On iPhone the accessory goes up
 *  into the shell's top bar (`ShellBarContext`) and the status ends the meta line, so the title has the whole width. */

import React, { useContext } from 'react';
import { createPortal } from 'react-dom';
import { ShellBarContext } from './shell-bar';
import { useFormFactor } from '@platform/formFactor';
import { LAYOUT } from '@config/layout.config';
import { TitlebarSpacer } from './page-scroll';

export interface TitleBlockProps {
  /** The title line's content (a leading mark, the title, its inline tools). */
  title: React.ReactNode;
  meta?: React.ReactNode;
  /** Its state while it works (a badge). */
  status?: React.ReactNode;
  /** Its commands (the ⋯ menu). */
  accessory?: React.ReactNode;
  /** Rows under the title (a notice, the header's controls). */
  children?: React.ReactNode;
}

export function TitleBlock({ title, meta, status, accessory, children }: TitleBlockProps) {
  const phone = useFormFactor() === 'phone';
  const bar = useContext(ShellBarContext);
  const end = (status || accessory) && <div className="ml-auto flex shrink-0 items-center gap-2">{status}{accessory}</div>;
  // iPhone: the commands go up to the shell's bar when it has one; without one they end the meta line with the status.
  const inBar = phone && bar !== null;
  const metaEnd = phone && (status || (!inBar && accessory)) && <div className="ml-auto flex shrink-0 items-center gap-2">{status}{!inBar && accessory}</div>;
  return (
    <>
      <TitlebarSpacer />
      {inBar && accessory && createPortal(accessory, bar)}
      <header className={`${LAYOUT.pageGutter} py-3`}>
        <div className={`${LAYOUT.pageColumn} space-y-2`}>
          <div className="flex items-center gap-2">{title}{!phone && end}</div>
          {(meta || metaEnd) && <div className="flex items-center gap-2">{meta}{metaEnd}</div>}
          {children}
        </div>
      </header>
    </>
  );
}
