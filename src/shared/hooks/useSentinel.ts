import { useEffect, useRef, type RefObject } from 'react';

interface UseSentinelOptions {
  onIntersect: () => void;
  enabled?: boolean;
  threshold?: number;
  rootMargin?: string;
}

export function useSentinel({
  onIntersect,
  enabled = true,
  threshold = 0.1,
  rootMargin = '200px',
}: UseSentinelOptions): RefObject<HTMLDivElement | null> {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onIntersectRef = useRef(onIntersect);
  onIntersectRef.current = onIntersect;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !enabled) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onIntersectRef.current();
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, threshold, rootMargin]);

  return sentinelRef;
}
