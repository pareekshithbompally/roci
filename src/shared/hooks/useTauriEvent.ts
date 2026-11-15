/**
 * useTauriEvent — subscribe a component to one Rust → webview event for its
 * lifetime. Services export the event name and payload type; this owns the
 * listen / unlisten lifecycle (async registration included) in one place.
 * The latest handler always runs, so callers needn't memoize it.
 */

import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { isTauriEnvironment } from '@services/tauri';
import { failureLogger } from '@shared/utils/errors';

const report = failureLogger('useTauriEvent');

export function useTauriEvent<T>(event: string, handler: (payload: T) => void): void {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!isTauriEnvironment()) return;
    const unlisten = listen<T>(event, ({ payload }) => latest.current(payload));
    return () => {
      unlisten.then((stop) => stop()).catch(report(`unlisten ${event}`));
    };
  }, [event]);
}
