/** A place's one primary action (Add Files, New To-do, a meeting's +): the loudest thing on the screen, declared once by the
 *  place and drawn here. On a Mac a filled accent button with its words in the title row (`ViewHeader` / `TitleBlock`
 *  `primaryAction`); on iPhone the floating button above the home bar. `PrimaryActionControl` is the bare control, so a
 *  place whose action is a menu (`Menu` from `@shared/components`) uses it as the trigger; an empty place shows
 *  `EmptyAction` instead (the header's steps aside, so there is still one). Nothing else is drawn in the accent. */

import { Plus, type LucideIcon } from 'lucide-react';
import { useFormFactor } from '@platform/formFactor';
import { Button } from './button';
import { FabButton } from './action-fab';
import { Icon } from './icon';

export interface PrimaryActionSpec {
  label: string;
  /** Its glyph; the + when none. */
  icon?: LucideIcon;
  onPress: () => void;
  disabled?: boolean;
}

export interface PrimaryActionControlProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string;
  icon?: LucideIcon;
  ref?: React.Ref<HTMLButtonElement>;
}

/** The control: the title row's accent button (Mac) or the floating button (iPhone). */
export function PrimaryActionControl({ label, icon, ...props }: PrimaryActionControlProps) {
  const phone = useFormFactor() === 'phone';
  if (phone) return <FabButton label={label} icon={icon} {...props} />;
  return (
    <Button variant="primary" size="sm" {...props}>
      <Icon icon={icon ?? Plus} size="xs" />
      {label}
    </Button>
  );
}

/** A place's primary action that does one thing. */
export function PrimaryAction({ action }: { action: PrimaryActionSpec }) {
  return <PrimaryActionControl label={action.label} icon={action.icon} onClick={action.onPress} disabled={action.disabled} />;
}

/** The empty state's form: large, in the middle, where the screen's content would be. */
export function EmptyAction({ action }: { action: PrimaryActionSpec }) {
  return (
    <Button variant="primary" size="lg" onClick={action.onPress} disabled={action.disabled}>
      <Icon icon={action.icon ?? Plus} size="sm" />
      {action.label}
    </Button>
  );
}
