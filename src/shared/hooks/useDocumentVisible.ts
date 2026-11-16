/** Whether the page is on screen (not hidden, minimised or in a hidden window), from the browser's own visibility event. */

import { useSyncExternalStore } from 'react';

const subscribe = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
};

const visible = () => document.visibilityState === 'visible';

export function useDocumentVisible(): boolean {
  return useSyncExternalStore(subscribe, visible, visible);
}
