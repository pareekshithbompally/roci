/** Open while work runs, folded a beat after; a user toggle stands until work starts again. */

import { useEffect, useRef, useState } from 'react';
import { ANIMATION_CONFIG } from '@config/animations.config';

export function useAutoFold(running: boolean): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(running);
  const wasRunning = useRef(running);

  useEffect(() => {
    const finished = wasRunning.current && !running;
    wasRunning.current = running;
    if (running) setOpen(true);
    if (!finished) return;
    const fold = setTimeout(() => setOpen(false), ANIMATION_CONFIG.chat.toolFoldDelayMs);
    return () => clearTimeout(fold);
  }, [running]);

  return [open, setOpen];
}
