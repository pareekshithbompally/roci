/** A list and its open item, one description for both form factors: a Mac shows the list beside the open item (a split
 *  view); iPhone shows the list, and opening an item pushes it as a page with Back and a swipe from the edge (Mail). */

import React from 'react';
import { useFormFactor } from '@platform/formFactor';
import { PushedPage } from './nav-stack';
import { ViewBody } from './page-scroll';
import { Surface } from './surface';
import { ViewHeader } from './view-header';
import type { PrimaryActionSpec } from './primary-action';
import { cn } from './utils';

/** Whether the list and its open item show together (a Mac), so one is always open; iPhone opens one only when tapped. */
export function useListBesideDetail(): boolean {
  return useFormFactor() !== 'phone';
}

export interface ListDetailProps {
  title: string;
  /** Controls at the end of the title row. */
  accessory?: React.ReactNode;
  /** The place's one primary action (kit `PrimaryAction`). */
  primaryAction?: PrimaryActionSpec;
  /** The list (and its search). */
  list: React.ReactNode;
  /** The list column's width beside the open item (a Mac). */
  listClassName?: string;
  /** The open item, or nothing. */
  detail: React.ReactNode;
  /** The open item's title in its pushed page's bar (iPhone); none when the item's own header names it (Mail). */
  detailTitle?: string;
  /** Back from the open item (iPhone). */
  onCloseDetail: () => void;
}

export function ListDetail({ title, accessory, primaryAction, list, listClassName, detail, detailTitle, onCloseDetail }: ListDetailProps) {
  const beside = useListBesideDetail();
  return (
    <div className="relative flex h-full min-w-0 flex-col">
      <ViewHeader title={title} accessory={accessory} primaryAction={primaryAction} />
      <ViewBody className="gap-6">
        <div className={cn('flex min-h-0 min-w-0 flex-col gap-3', beside ? listClassName : 'flex-1')}>{list}</div>
        {beside && detail && (
          <Surface edge={['top', 'left', 'right']} radius="lg" className="min-w-0 flex-1 overflow-y-auto custom-scrollbar">{detail}</Surface>
        )}
      </ViewBody>
      {!beside && <PushedPage open={!!detail} title={detailTitle ?? ''} onBack={onCloseDetail}>{detail}</PushedPage>}
    </div>
  );
}
