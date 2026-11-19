/** The time, updated as each minute turns while the window is on screen: one timer armed for the next minute boundary,
 *  none while hidden, and a fresh reading on return (a visible clock, I10). */

import { useEffect, useState } from 'react';
import { useDocumentVisible } from './useDocumentVisible';

const MS_PER_MINUTE = 60_000;

export function useMinuteClock(): Date {
  const visible = useDocumentVisible();
  const [now, setNow] = useState(() => new Date());

  // Back on screen: the time it is now, not when the window was hidden.
  useEffect(() => {
    if (visible) setNow(new Date());
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setNow(new Date()), MS_PER_MINUTE - (now.getTime() % MS_PER_MINUTE));
    return () => clearTimeout(timer);
  }, [now, visible]);

  return now;
}
