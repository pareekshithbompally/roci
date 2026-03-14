/**
 * useAppShortcuts Hook
 *
 * In-app DOM-level keyboard shortcuts (separate from Tauri global shortcuts).
 * - Cmd+K / Ctrl+K → toggle search overlay
 * - Cmd+L / Ctrl+L → focus chat input
 * - Escape → close search overlay
 */

import { useEffect } from 'react';

interface UseAppShortcutsOptions {
  onToggleSearch: () => void;
  onFocusChatInput: () => void;
}

export function useAppShortcuts({ onToggleSearch, onFocusChatInput }: UseAppShortcutsOptions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Cmd+K — toggle search overlay (always, even in inputs)
      if (mod && e.key === 'k') {
        e.preventDefault();
        onToggleSearch();
        return;
      }

      // Cmd+L — focus chat input (always, even in inputs)
      if (mod && e.key === 'l') {
        e.preventDefault();
        onFocusChatInput();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onToggleSearch, onFocusChatInput]);
}

export default useAppShortcuts;
