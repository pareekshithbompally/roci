/** Open while work runs, folded `foldDelayMs` after it finishes; once the user opens or closes it, their choice stands. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ANIMATION_CONFIG } from '@config/animations.config';

export function useAutoFold(
  running: boolean,
  foldDelayMs: number = ANIMATION_CONFIG.chat.activityFoldDelayMs,
): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(running);
  const wasRunning = useRef(running);
  const chosen = useRef(false);

  useEffect(() => {
    const finished = wasRunning.current && !running;
    wasRunning.current = running;
    if (chosen.current) return;
    if (running) setOpen(true);
    if (!finished) return;
    const fold = setTimeout(() => setOpen(false), foldDelayMs);
    return () => clearTimeout(fold);
  }, [running, foldDelayMs]);

  const choose = useCallback((next: boolean) => {
    chosen.current = true;
    setOpen(next);
  }, []);

  return [open, choose];
}
