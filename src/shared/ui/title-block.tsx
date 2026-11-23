/** A meeting's header, recording or finished: clear of the titlebar, in the page column: the title line, then its meta line (date, details). Its `accessory` (state, menu) ends the title
 *  line on a Mac; on a phone it ends the meta line instead, so the title has the whole width. */

import React from 'react';
import { useFormFactor } from '@platform/formFactor';
import { LAYOUT } from '@config/layout.config';
import { TitlebarSpacer } from './page-scroll';

export interface TitleBlockProps {
  /** The title line's content (a leading mark, the title, its inline tools). */
  title: React.ReactNode;
  meta?: React.ReactNode;
  accessory?: React.ReactNode;
  /** Rows under the title (a notice, the header's controls). */
  children?: React.ReactNode;
}

export function TitleBlock({ title, meta, accessory, children }: TitleBlockProps) {
  const phone = useFormFactor() === 'phone';
  const end = accessory && <div className="ml-auto flex shrink-0 items-center gap-2">{accessory}</div>;
  return (
    <>
      <TitlebarSpacer />
      <header className={`${LAYOUT.pageGutter} py-3`}>
        <div className={`${LAYOUT.pageColumn} space-y-2`}>
          <div className="flex items-center gap-2">{title}{!phone && end}</div>
          {(meta || (phone && end)) && <div className="flex items-center gap-2">{meta}{phone && end}</div>}
          {children}
        </div>
      </header>
    </>
  );
}
