import React from 'react';
import { Check, X } from 'lucide-react';
import { useFormFactor } from '@platform/formFactor';
import { KIT_COPY } from '@config/kitCopy.config';
import { confirm } from '@shared/stores/confirmStore';
import {
  Button,
  CardRow,
  Dialog,
  EditSheet,
  type DialogContentProps,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  IconButton,
  PageBody,
  PushedScreen,
  Spinner,
  Section,
  useOptionalNavStack,
  Text,
} from '@shared/ui';

interface FormCommand {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Controls left of the close button (e.g. a JSON-mode toggle). */
  headerAction?: React.ReactNode;
  /** Shown above the commands when set. */
  error?: string | null;
  /** The form's one save action: Cancel then this in a Mac's footer; ✓ in a phone's sheet bar (✕ cancels). */
  submit: FormCommand & { busy?: boolean };
  /** A second command (Delete, Reset): the footer's leading end on a Mac; an action row closing the sheet on a phone. */
  aside?: FormCommand & { tone?: 'danger' };
  /** A view with nothing to save (a preview): Done alone closes it. */
  viewOnly?: boolean;
  size?: DialogContentProps['size'];
  /** Something was edited: a pushed page asks before Back drops it. */
  dirty?: boolean;
  children: React.ReactNode;
}

const ErrorLine: React.FC<{ error?: string | null }> = ({ error }) =>
  error ? (
    <Text as="p" role="alert" variant="helper" tone="danger" className="mt-3 whitespace-pre-wrap break-words">
      {error}
    </Text>
  ) : null;

/** The Mac footer: the side command at the leading end, then Cancel and the save action (or Done alone). */
const MacFooter: React.FC<Pick<FormDialogProps, 'submit' | 'aside' | 'viewOnly' | 'onOpenChange'>> = ({ submit, aside, viewOnly, onOpenChange }) => (
  <>
    {aside && <Button variant={aside.tone === 'danger' ? 'dangerGhost' : 'ghost'} onClick={aside.onPress} disabled={aside.disabled} className="mr-auto">{aside.label}</Button>}
    {!viewOnly && <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submit.busy}>{KIT_COPY.cancel}</Button>}
    <Button onClick={submit.onPress} disabled={submit.disabled} loading={submit.busy}>{submit.label}</Button>
  </>
);

/** Settings form dialog: a sheet on a Mac with its footer; on a phone the iOS edit sheet (✕ / title / ✓), the side
 *  command as an action row at its end. Outside clicks are ignored so a half-filled form is never lost. */
export const FormDialog: React.FC<FormDialogProps> = (props) =>
  useFormFactor() === 'phone' ? <PhoneForm {...props} /> : <DesktopForm {...props} />;

/** A phone form's content: the fields, the error, and the side command as an action row at the end. */
const PhoneFormBody: React.FC<Pick<FormDialogProps, 'headerAction' | 'error' | 'aside' | 'children'>> = ({ headerAction, error, aside, children }) => (
  <>
    {headerAction && <div className="flex justify-end">{headerAction}</div>}
    {children}
    <ErrorLine error={error} />
    {aside && (
      <Section>
        <CardRow title={aside.label} tone={aside.tone ?? 'accent'} disabled={aside.disabled} onPress={aside.onPress} />
      </Section>
    )}
  </>
);

const askDiscard = () => confirm({ title: KIT_COPY.discard.title, confirmLabel: KIT_COPY.discard.confirm, cancelLabel: KIT_COPY.discard.keep, tone: 'danger' });
/** While saving, Back waits for the answer. */
const stay = () => Promise.resolve(false);

/** Inside a navigation stack (Settings) a form is a pushed page with ✓ in its bar (Settings › Wi-Fi › Other); anywhere
 *  else, the iOS edit sheet (✕ / title / ✓). */
const PhoneForm: React.FC<FormDialogProps> = ({ open, onOpenChange, title, submit, dirty, ...body }) => {
  const stacked = useOptionalNavStack() !== null;
  const canSave = !submit.disabled && !submit.busy;
  if (!stacked) {
    // ✕, the scrim and Escape ask before dropping edits; a drag down keeps the sheet (held).
    const close = (next: boolean) => {
      if (next || submit.busy) return;
      if (!dirty) return onOpenChange(false);
      askDiscard().then((yes) => yes && onOpenChange(false)).catch((error: unknown) => console.error('[FormDialog] ask failed:', error));
    };
    return (
      <EditSheet open={open} onOpenChange={close} title={title} canSave={canSave} onSave={submit.onPress} saveLabel={submit.label} busy={submit.busy} held={dirty || submit.busy}>
        <PhoneFormBody {...body} />
      </EditSheet>
    );
  }
  return (
    <PushedScreen
      open={open}
      title={title}
      onClose={() => onOpenChange(false)}
      confirmBack={submit.busy ? stay : dirty ? askDiscard : undefined}
      action={submit.busy ? <Spinner /> : <IconButton icon={Check} label={submit.label} size="fab" variant="bar" disabled={!canSave} onClick={submit.onPress} />}
    >
      <PageBody>
        <PhoneFormBody {...body} />
      </PageBody>
    </PushedScreen>
  );
};

const DesktopForm: React.FC<FormDialogProps> = ({ open, onOpenChange, title, headerAction, error, size = 'lg', children, ...commands }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogPortal>
      <DialogOverlay />
      <DialogContent size={size} scrollable onInteractOutside={(e) => e.preventDefault()} aria-describedby={undefined}>
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          <div className="flex items-center gap-1 -mr-1">
            {headerAction}
            <DialogClose asChild>
              <IconButton icon={X} label={KIT_COPY.close} size="sm" />
            </DialogClose>
          </div>
        </DialogHeader>
        <DialogBody>{children}</DialogBody>
        <ErrorLine error={error} />
        <DialogFooter className="shrink-0"><MacFooter onOpenChange={onOpenChange} {...commands} /></DialogFooter>
      </DialogContent>
    </DialogPortal>
  </Dialog>
);
