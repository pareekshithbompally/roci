/** A Settings pane's header (macOS System Settings): its icon, its name, and a line on what it covers, in a card above its rows. */

import type React from 'react';
import { UI_CONFIG } from '@config/ui.config';
import { Text } from './text';
import { GROUPED_SURFACE } from './recipes';
import { cn } from './utils';
import { useFormFactor } from '@platform/formFactor';

const H = UI_CONFIG.paneHero;

export interface PaneHeroProps {
  /** The pane's icon image, already in the current appearance. */
  image: string;
  title: string;
  /** A line under the name (About: the version). */
  caption?: string;
  description: string;
  /** Below the description: links and a credit line (About). */
  footer?: React.ReactNode;
}

/** iPhone: a slim card, everything left-aligned — the icon at the leading edge, the name and its line beside it. */
function CompactHero({ image, title, caption, description, footer }: PaneHeroProps) {
  return (
    <div className={cn(GROUPED_SURFACE, 'flex flex-col gap-2 px-4 py-3')}>
      <div className="flex items-center gap-row-icon">
        <img src={image} alt="" aria-hidden width={H.compactTile} height={H.compactTile} className="shrink-0" />
        <div className="min-w-0">
          <Text as="h2" variant="title">{title}</Text>
          {caption && <Text as="p" variant="caption" tone="muted">{caption}</Text>}
          <Text as="p" variant="caption" tone="muted">{description}</Text>
        </div>
      </div>
      {footer && <div className="flex flex-col items-start gap-1">{footer}</div>}
    </div>
  );
}

export function PaneHero(props: PaneHeroProps) {
  if (useFormFactor() === 'phone') return <CompactHero {...props} />;
  const { image, title, caption, description, footer } = props;
  return (
    <div className={cn(GROUPED_SURFACE, 'flex flex-col items-center gap-2 px-6 py-6 text-center')}>
      <img src={image} alt="" aria-hidden width={H.tile} height={H.tile} className="mb-1 shrink-0" />
      <Text as="h2" variant="pageTitle">{title}</Text>
      {caption && <Text as="p" variant="helper" tone="muted">{caption}</Text>}
      <Text as="p" tone="muted">{description}</Text>
      {footer && <div className="mt-2 flex flex-col items-center gap-1">{footer}</div>}
    </div>
  );
}
