/** Subscribe to one Rust → webview event for the component lifetime; the latest handler always runs. */

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
