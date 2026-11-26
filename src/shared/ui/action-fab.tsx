/** The one floating + button at the bottom-right corner (To-dos, a meeting), and what it opens: a corner panel on a Mac, a
 *  pushed screen on iPhone. */

import React from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { IconButton } from './button';
import { FormActions } from './form-actions';
import { Surface } from './surface';
import { Text } from './text';
import { FormPage, PushedPage } from './nav-stack';
import { useFormFactor } from '@platform/formFactor';
import { KIT_COPY } from '@config/kitCopy.config';
import { cn } from './utils';
import { UI_CONFIG } from '@config/ui.config';

const { inset, width, maxHeight } = UI_CONFIG.layout.cornerPanel;
const { safeArea } = UI_CONFIG.layout.titlebar;

/** Bottom-right, clear of the home indicator and the keyboard on a phone (`--safe-bottom`). */
const CORNER: React.CSSProperties = { right: inset, bottom: `calc(var(--safe-bottom) + ${inset}px)` };

export type FabButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  /** Its name (VoiceOver, tooltip). */
  label: string;
  /** Not adding (a meeting's chat while it records): its own glyph, on the AI fill. Else the +. */
  glyph?: LucideIcon;
  ref?: React.Ref<HTMLButtonElement>;
};

/** The floating button. A tap does its one action, or it is the trigger of the screen's add menu (`Menu`, native on a Mac). */
export function FabButton({ label, glyph, className, style, ...props }: FabButtonProps) {
  return (
    <IconButton
      icon={glyph ?? Plus}
      variant={glyph ? 'ai' : 'primary'}
      size="float"
      label={label}
      className={cn('fixed z-floating animate-content-show', className)}
      style={{ ...CORNER, ...style }}
      {...props}
    />
  );
}

export interface CornerPanelProps {
  /** Its name (VoiceOver). */
  label: string;
  /** Its bar, held above the content. */
  header: React.ReactNode;
  /** Full height (a chat); else as tall as its content (a form). */
  fill?: boolean;
  children: React.ReactNode;
}

/** A Mac panel floating at the corner its + button sits in: what the button opened (a new to-do, the meeting chat). */
export function CornerPanel({ label, header, fill, children }: CornerPanelProps) {
  const cap = `min(${maxHeight}px, calc(100vh - ${safeArea + inset}px))`;
  return (
    <Surface
      variant="floating"
      radius="xl"
      role="dialog"
      aria-label={label}
      className="fixed z-floating flex flex-col overflow-hidden animate-content-show"
      style={{ right: inset, bottom: inset, width, ...(fill ? { height: cap } : { maxHeight: cap }) }}
    >
      {header}
      {children}
    </Surface>
  );
}

/** A corner panel's bar: its title, its controls, and the control that puts it away. */
function PanelBar({ title, actions, close }: { title: string; actions?: React.ReactNode; close: React.ReactNode }) {
  return (
    <Surface edge="bottom" className="flex h-11 shrink-0 items-center gap-1 pl-4 pr-2">
      <Text as="h2" variant="bodyStrong" truncate className="flex-1">{title}</Text>
      {actions}
      {close}
    </Surface>
  );
}

export interface AddFormProps {
  /** False slides it away (iPhone) or puts it away (Mac). */
  open: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void;
  /** What saving does (Add), for the button and VoiceOver. */
  saveLabel: string;
  canSave: boolean;
  busy?: boolean;
  /** The fields, in their cards. */
  children: React.ReactNode;
}

/** Making one new thing from a + (a to-do): on a Mac the corner panel with Cancel and the save button; on iPhone a
 *  page pushed over the app with ‹ and ✓. The fields are the same on both. */
export function AddForm({ open, title, onClose, onSave, saveLabel, canSave, busy, children }: AddFormProps) {
  if (useFormFactor() === 'phone') {
    return (
      <FormPage open={open} title={title} onClose={onClose} canSave={canSave} onSave={onSave} saveLabel={saveLabel} busy={busy}>
        {children}
      </FormPage>
    );
  }
  if (!open) return null;
  return (
    <CornerPanel label={title} header={<PanelBar title={title} close={<IconButton icon={X} label={KIT_COPY.close} size="sm" onClick={onClose} />} />}>
      {/* Its cards on the grouped background, as a form is everywhere. */}
      <Surface variant="grouped" className="flex min-h-0 flex-col">
        <form
          className="flex min-h-0 flex-col gap-section overflow-y-auto p-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
        >
          {children}
          <FormActions onCancel={onClose} submit={{ label: saveLabel, disabled: !canSave, busy, submits: true }} />
        </form>
      </Surface>
    </CornerPanel>
  );
}

export interface PanelScreenProps {
  /** False slides it away (iPhone) or puts it away (Mac). */
  open: boolean;
  title: string;
  /** Its name for VoiceOver (a Mac's panel). */
  label: string;
  /** Put away: a Mac's ⌄, iPhone's ‹ (or a swipe back). */
  onClose: () => void;
  /** Controls in its bar on both (New chat). */
  actions?: React.ReactNode;
  /** Controls only a Mac's panel has room for (Open full chat). */
  panelActions?: React.ReactNode;
  /** Fills it and scrolls itself (a chat). */
  children: React.ReactNode;
}

/** Something a + opened that you stay in (a meeting's chat): a full-height corner panel on a Mac, its own screen with ‹ on
 *  iPhone. */
export function PanelScreen({ open, title, label, onClose, actions, panelActions, children }: PanelScreenProps) {
  if (useFormFactor() === 'phone') return <PushedPage open={open} title={title} onBack={onClose} action={actions} over="app" fill>{children}</PushedPage>;
  if (!open) return null;
  return (
    <CornerPanel
      label={label}
      fill
      header={<PanelBar title={title} actions={<>{actions}{panelActions}</>} close={<IconButton icon={ChevronDown} label={KIT_COPY.minimize} size="sm" onClick={onClose} />} />}
    >
      {children}
    </CornerPanel>
  );
}
