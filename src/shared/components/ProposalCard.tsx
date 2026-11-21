/** A card above the chat box holding changes the AI proposed: nothing is saved until the user confirms. Each row shows what
 *  it is (wrapping, at most two lines) and a muted detail line; Edit opens the row in a sheet, ✕ drops it. */

import React from 'react';
import { CheckCircle2, Loader2, Pencil, X, type LucideIcon } from 'lucide-react';
import { Button, Icon, IconButton, Separator, Surface, Text } from '@shared/ui';
import { LAYOUT } from '@config/layout.config';

export interface ProposalItem {
  id: string;
  title: string;
  /** What the change does to something existing ("Delete"), before its title. */
  verb?: string;
  /** One line under the title: dates, owner, source. */
  detail?: string;
  state: 'pending' | 'saving' | 'saved' | 'error';
  error?: string;
  onEdit?: () => void;
  onRemove?: () => void;
}

export interface ProposalCardProps {
  icon: LucideIcon;
  heading: string;
  items: ProposalItem[];
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ProposalRow: React.FC<{ item: ProposalItem; locked: boolean }> = ({ item, locked }) => (
  <div className="flex items-start gap-3 px-4 py-2">
    <div className="min-w-0 flex-1">
      <Text as="p" className="line-clamp-2 break-words">{item.verb ? `${item.verb}: ${item.title}` : item.title}</Text>
      {item.detail && <Text as="p" variant="helper" tone="muted" truncate>{item.detail}</Text>}
      {item.error && <Text as="p" variant="helper" tone="danger">{item.error}</Text>}
    </div>
    {!locked && (
      <div className="flex shrink-0 items-center">
        {item.onEdit && <IconButton icon={Pencil} size="toolbar" label={`Edit ${item.title}`} onClick={item.onEdit} />}
        {item.onRemove && <IconButton icon={X} size="toolbar" label={`Remove ${item.title}`} onClick={item.onRemove} />}
      </div>
    )}
  </div>
);

/** The header's end: the actions while pending, then saving, then saved. */
function HeaderEnd({ items, confirmLabel, cancelLabel, onConfirm, onCancel }: ProposalCardProps) {
  if (items.some((i) => i.state === 'saving')) return <Icon icon={Loader2} size="sm" tone="muted" className="animate-spin" />;
  if (items.every((i) => i.state === 'saved')) return <Icon icon={CheckCircle2} size="sm" tone="success" />;
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button variant="ghost" size="sm" onClick={onCancel}>{cancelLabel}</Button>
      <Button size="sm" onClick={onConfirm}>{confirmLabel}</Button>
    </div>
  );
}

export const ProposalCard: React.FC<ProposalCardProps> = (props) => {
  const { icon, heading, items } = props;
  const locked = items.some((i) => i.state === 'saving' || i.state === 'saved');
  return (
    <Surface variant="field" radius="xl" role="region" aria-label={heading} className="overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2">
        <Icon icon={icon} size="sm" tone="muted" className="shrink-0" />
        <Text variant="bodyStrong" truncate className="min-w-0 flex-1">{heading}</Text>
        <HeaderEnd {...props} />
      </div>
      <Separator />
      <div className={LAYOUT.proposalList}>
        {items.map((item, index) => (
          <React.Fragment key={item.id}>
            {index > 0 && <Separator />}
            <ProposalRow item={item} locked={locked} />
          </React.Fragment>
        ))}
      </div>
    </Surface>
  );
};
