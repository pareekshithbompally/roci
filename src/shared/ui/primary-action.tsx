/** A place's one primary action (Add Files, New To-do, Dictate): the loudest thing on the screen, declared once by the place
 *  and drawn here. On a Mac a filled accent button with its words in the title row; on iPhone the floating button above the
 *  home bar; on an empty screen the empty state's own button (the header's then steps aside, so there is still one). */

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

/** The title row's (Mac) or the floating (iPhone) form of a place's primary action. */
export function PrimaryAction({ action }: { action: PrimaryActionSpec }) {
  const phone = useFormFactor() === 'phone';
  if (phone) return <FabButton label={action.label} onClick={action.onPress} disabled={action.disabled} />;
  return (
    <Button variant="primary" size="sm" onClick={action.onPress} disabled={action.disabled}>
      <Icon icon={action.icon ?? Plus} size="xs" />
      {action.label}
    </Button>
  );
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
