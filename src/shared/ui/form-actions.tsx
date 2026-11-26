/** A Mac form's one row of commands, the same in every form (a dialog, a corner panel): the side command (Delete, Reset) at
 *  the leading end, then Cancel and the save action, or Done alone for something with nothing to save. */

import { Button } from './button';
import { KIT_COPY } from '@config/kitCopy.config';

export interface FormCommand {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export interface FormActionsProps {
  onCancel: () => void;
  /** The save action; `submits`: it is its form's submit button (Return saves), so it has no click of its own. */
  submit: Omit<FormCommand, 'onPress'> & { onPress?: () => void; busy?: boolean; submits?: boolean };
  aside?: FormCommand & { tone?: 'danger' };
  /** Nothing to save (a preview): the save action alone, no Cancel. */
  viewOnly?: boolean;
}

export function FormActions({ onCancel, submit, aside, viewOnly }: FormActionsProps) {
  return (
    <div className="flex w-full items-center justify-end gap-2">
      {aside && <Button variant={aside.tone === 'danger' ? 'dangerGhost' : 'ghost'} onClick={aside.onPress} disabled={aside.disabled} className="mr-auto">{aside.label}</Button>}
      {!viewOnly && <Button variant="ghost" onClick={onCancel} disabled={submit.busy}>{KIT_COPY.cancel}</Button>}
      <Button type={submit.submits ? 'submit' : 'button'} onClick={submit.submits ? undefined : submit.onPress} disabled={submit.disabled} loading={submit.busy}>{submit.label}</Button>
    </div>
  );
}
