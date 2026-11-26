/** The one floating + button at the bottom-right corner (To-dos, a meeting), and the panel it opens on a Mac. One action: a
 *  tap does it. Several: a tap fans out a menu from the button (UIMenu), each row a label and its glyph. */

import React from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button, IconButton } from './button';
import { Surface } from './surface';
import { Text } from './text';
import { EditPage } from './cover-page';
import { PushedPage } from './nav-stack';
import { useFormFactor } from '@platform/formFactor';
import { KIT_COPY } from '@config/kitCopy.config';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';
import { UI_CONFIG } from '@config/ui.config';

const { inset, width, maxHeight } = UI_CONFIG.layout.cornerPanel;
const { safeArea } = UI_CONFIG.layout.titlebar;

/** Bottom-right, clear of the home indicator and the keyboard on a phone (`--safe-bottom`). */
const CORNER: React.CSSProperties = { right: inset, bottom: `calc(var(--safe-bottom) + ${inset}px)` };

export interface FabAction {
  id: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
}

export interface ActionFabProps {
  /** The button's name (VoiceOver, tooltip) when it fans out; one action names it itself. */
  label: string;
  actions: FabAction[];
  /** One action that isn't adding (a meeting's chat while it records): its own glyph, on the AI fill. */
  glyph?: LucideIcon;
}

export function ActionFab({ label, actions, glyph }: ActionFabProps) {
  const button = (props: { label: string; onClick?: () => void }) => (
    <IconButton icon={glyph ?? Plus} variant={glyph ? 'ai' : 'primary'} size="float" className="fixed z-floating animate-content-show" style={CORNER} {...props} />
  );
  if (actions.length === 1) return button({ label: actions[0].label, onClick: actions[0].onSelect });
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{button({ label })}</DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end">
        {actions.map((action) => (
          <DropdownMenuItem key={action.id} icon={action.icon} onSelect={action.onSelect}>{action.label}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
 *  full-screen page with ✕ and ✓. The fields are the same on both. */
export function AddForm({ title, onClose, onSave, saveLabel, canSave, busy, children }: AddFormProps) {
  if (useFormFactor() === 'phone') {
    return (
      <EditPage open onOpenChange={(open) => !open && onClose()} title={title} canSave={canSave} onSave={onSave} saveLabel={saveLabel} busy={busy}>
        {children}
      </EditPage>
    );
  }
  return (
    <CornerPanel label={title} header={<PanelBar title={title} close={<IconButton icon={X} label={KIT_COPY.close} size="sm" onClick={onClose} />} />}>
      <form
        className="flex min-h-0 flex-col gap-section overflow-y-auto p-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        {children}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>{KIT_COPY.cancel}</Button>
          <Button type="submit" disabled={!canSave} loading={busy}>{saveLabel}</Button>
        </div>
      </form>
    </CornerPanel>
  );
}

export interface PanelScreenProps {
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
export function PanelScreen({ title, label, onClose, actions, panelActions, children }: PanelScreenProps) {
  if (useFormFactor() === 'phone') return <PushedPage open title={title} onBack={onClose} action={actions} over="app" fill>{children}</PushedPage>;
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
