/** An item's detail (a calendar event): a header, its rows, its notes. A Mac shows it as Calendar.app's popover — the
 *  colour as a bar beside the title, each row its own stacked card; a phone as an iOS detail sheet — a colour dot, one
 *  grouped card of rows. Screens describe the item once with CardRows; the layout is decided here. */

import React from 'react';
import { useFormFactor } from '@platform/formFactor';
import { Card, Section } from './card';
import { Surface } from './surface';
import { Text } from './text';

export interface DetailHeaderProps {
  /** The item's colour (its calendar's). */
  tint?: string;
  title: string;
  /** When it is, already formatted. */
  subtitle: string;
  /** A second line (a place). */
  detail?: string | null;
  /** A command at the header's end (Open meeting). */
  action?: React.ReactNode;
}

/** The colour mark: a bar down the header on a Mac, a dot before the title on a phone. */
const TintMark: React.FC<{ tint?: string; bar: boolean }> = ({ tint, bar }) => (
  <Surface tint={tint} className="flex shrink-0">
    <Surface variant="eventBar" radius="full" className={bar ? 'w-1 self-stretch' : 'mt-2 h-2.5 w-2.5'} />
  </Surface>
);

export function DetailHeader({ tint, title, subtitle, detail, action }: DetailHeaderProps) {
  const phone = useFormFactor() === 'phone';
  const copy = (
    <div className="min-w-0 flex-1">
      <Text as="h3" variant="title">{title}</Text>
      <Text as="p" variant="helper" tone="muted" className="whitespace-pre-wrap">{subtitle}</Text>
      {detail && <Text as="p" variant="helper" tone="muted" truncate>{detail}</Text>}
    </div>
  );
  return (
    <header className="flex items-stretch gap-3">
      <TintMark tint={tint} bar={!phone} />
      {phone ? copy : <Card className="flex flex-1 items-start gap-1 py-2.5">{copy}</Card>}
      {action && <div className="flex shrink-0 items-start">{action}</div>}
    </header>
  );
}

/** The rows: one grouped card on a phone, a stack of cards on a Mac. */
export function DetailList({ children }: { children: React.ReactNode }) {
  const phone = useFormFactor() === 'phone';
  if (phone) return <Section>{children}</Section>;
  const rows = React.Children.toArray(children).filter(Boolean);
  return <div className="flex flex-col gap-2">{rows.map((row, i) => <Card key={i}>{row}</Card>)}</div>;
}

/** The item's notes, in their own card. */
export function DetailNotes({ children }: { children: React.ReactNode }) {
  return (
    <Card className="py-3">
      <Text as="p" variant="helper" tone="muted" className="break-words whitespace-pre-line">{children}</Text>
    </Card>
  );
}
