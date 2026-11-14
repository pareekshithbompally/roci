/**
 * useAppShortcuts — the one window keydown listener for in-window shortcuts.
 *
 * Every `APP_SHORTCUTS` id must have a handler (the type enforces it), so a
 * shortcut in the registry can never be silently unbound. Acceptance rules:
 * see `accelerator.ts`.
 */

import { useEffect, useRef } from 'react';
import type { AppShortcutId } from '@config/shortcuts.config';
import { findAppShortcut } from '@features/shortcuts/accelerator';

export type AppShortcutHandlers = Record<AppShortcutId, () => void>;

export function useAppShortcuts(handlers: AppShortcutHandlers): void {
  // Latest handlers without re-subscribing the listener every render.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const id = findAppShortcut(event);
      if (!id) return;
      event.preventDefault();
      handlersRef.current[id]();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
