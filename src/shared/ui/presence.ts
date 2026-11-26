import { useEffect, useState } from 'react';
import type React from 'react';

/** A layer that animates out before it unmounts (a pushed page, a full-screen page): mounted while `open` and while its exit
 *  animation plays. Put `onAnimationEnd` on the animated element; `hide` drops it at once (a swipe already carried it off). */
export function usePresence(open: boolean) {
  const [shown, setShown] = useState(open);
  useEffect(() => {
    if (open) setShown(true);
  }, [open]);
  const onAnimationEnd = (e: React.AnimationEvent<HTMLElement>) => {
    if (e.target === e.currentTarget && !open) setShown(false);
  };
  return { shown, hide: () => setShown(false), onAnimationEnd };
}
