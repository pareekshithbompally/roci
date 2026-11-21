import React from 'react';
import { cn } from './utils';
import { platform } from '@platform/index';
import { UI_CONFIG } from '@config/ui.config';

/** Keyboard shortcut badge (⌘K, ⌘L…); not shown on touch screens, which have no shortcuts. */
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  if (platform.hasTouchScreen) return null;
  return (
    <kbd
      className={cn(
        'inline-flex items-center gap-0.5 h-5 px-1.5 rounded bg-layer-2 text-faint text-subheadline font-medium font-sans',
        className,
      )}
      {...props}
    />
  );
}

/** A shortcut as macOS shows it: one keycap per key (⌘ K) beside a menu item or command; `field` runs the keys together in
 *  one rounded field, as a settings row shows its shortcut (System Settings › Keyboard). The one way to draw a shortcut. */
export function Keycaps({ keys, variant = 'caps' }: { keys: readonly string[]; variant?: 'caps' | 'field' }) {
  if (variant === 'field') {
    if (platform.hasTouchScreen) return null;
    return (
      <kbd className={cn('inline-flex h-control-md items-center justify-center rounded-field bg-control font-sans text-body font-medium tracking-wider text-primary', UI_CONFIG.settingControl.field)}>
        {keys.join('')}
      </kbd>
    );
  }
  return <span className="inline-flex items-center gap-1">{keys.map((key) => <Kbd key={key}>{key}</Kbd>)}</span>;
}
