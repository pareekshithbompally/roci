/** iPhone's full-screen page for making or editing one thing (New Reminder): it rises over everything, ✕ cancels at the
 *  leading edge, its save at the trailing edge, the title between, the fields below. No drag: it leaves only by ✕ or save,
 *  so a half-typed form is never lost to a stray swipe. A Radix dialog: focus stays inside, Escape cancels, VoiceOver
 *  reads its name. */

import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, X } from 'lucide-react';
import { IconButton } from './button';
import { Spinner } from './spinner';
import { Surface } from './surface';
import { Text } from './text';
import { PageScroll } from './page-scroll';
import { cn } from './utils';
import { usePresence } from './presence';
import { KIT_COPY } from '@config/kitCopy.config';

export interface CoverPageProps {
  open: boolean;
  title: string;
  /** ✕ (and Escape). */
  onCancel: () => void;
  cancelLabel: string;
  /** The save control at the trailing edge (✓, or a spinner while saving). */
  action: React.ReactNode;
  children: React.ReactNode;
}

export function CoverPage({ open, title, onCancel, cancelLabel, action, children }: CoverPageProps) {
  const { shown, onAnimationEnd } = usePresence(open);
  if (!shown) return null;
  return (
    <DialogPrimitive.Root open onOpenChange={(next) => !next && onCancel()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn('fixed inset-0 z-modal outline-none', open ? 'animate-cover-in' : 'animate-cover-out')}
          // The caret is already where you type (the first field), not on ✕.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true });
          }}
          onAnimationEnd={onAnimationEnd}
        >
          <Surface variant="grouped" className="flex h-full flex-col pt-safe-top">
            <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pt-2 pb-3">
              <IconButton icon={X} label={cancelLabel} size="fab" variant="bar" onClick={onCancel} className="justify-self-start" />
              <DialogPrimitive.Title asChild>
                <Text as="h2" variant="headline">{title}</Text>
              </DialogPrimitive.Title>
              <div className="justify-self-end">{action}</div>
            </header>
            <PageScroll underTitlebar={false} className="flex-1">
              <div className="flex flex-col gap-section p-4 pb-sheet-end">{children}</div>
            </PageScroll>
          </Surface>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export interface EditPageProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** ✓ is greyed until there is something to save. */
  canSave: boolean;
  onSave: () => void;
  /** What ✓ does (Save, Add, Done), for VoiceOver. */
  saveLabel?: string;
  /** Saving: a spinner stands in for ✓. */
  busy?: boolean;
  children: React.ReactNode;
}

/** An iOS edit page (New Reminder): ✕ cancels, ✓ saves, the fields below in their own cards, no buttons in the content. */
export function EditPage({ open, onOpenChange, title, canSave, onSave, saveLabel = KIT_COPY.save, busy, children }: EditPageProps) {
  return (
    <CoverPage
      open={open}
      title={title}
      onCancel={() => onOpenChange(false)}
      cancelLabel={KIT_COPY.cancel}
      action={busy ? <Spinner /> : <IconButton icon={Check} label={saveLabel} size="fab" variant="bar" disabled={!canSave} onClick={onSave} />}
    >
      {children}
    </CoverPage>
  );
}
