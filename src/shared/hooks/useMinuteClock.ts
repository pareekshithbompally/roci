/** The time, updated as each minute turns: one timer armed for the next minute boundary while mounted (a visible clock). */

import { useEffect, useState } from 'react';

const MS_PER_MINUTE = 60_000;

export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setTimeout(() => setNow(new Date()), MS_PER_MINUTE - (now.getTime() % MS_PER_MINUTE));
    return () => clearTimeout(timer);
  }, [now]);
  return now;
}
