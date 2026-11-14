/**
 * useCopiedFlag — the "Copied" tick on a copy button: true briefly after
 * `markCopied()`, then false. The button itself is the feedback; no toast.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { UI_CONFIG } from '@config/ui.config';

export function useCopiedFlag(): { copied: boolean; markCopied: () => void } {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const markCopied = useCallback(() => {
    clearTimeout(timer.current);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), UI_CONFIG.copiedFeedbackMs);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);
  return { copied, markCopied };
}
