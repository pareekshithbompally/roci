/**
 * useFollowBottom — a scroll area that keeps its newest content in view: it
 * follows growth while at the bottom; scrolling up stops following until the
 * user is back at the bottom. Put `scrollRef` on the scroller and `contentRef`
 * on the content inside it.
 */

import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import { SCROLL_FOLLOW_THRESHOLD_PX } from '@config/chat.config';

export function useFollowBottom(onAtBottomChange?: (atBottom: boolean) => void) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const followRef = useRef(true);

  /** Follow again from the next growth, without scrolling now. */
  const follow = useCallback(() => {
    followRef.current = true;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    followRef.current = true;
    onAtBottomChange?.(true);
  }, [onAtBottomChange]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_FOLLOW_THRESHOLD_PX;
    onAtBottomChange?.(atBottom);
    if (atBottom) followRef.current = true;
  }, [onAtBottomChange]);

  // Scrolling up breaks follow; the view stays put while content grows below.
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (e.deltaY < 0) followRef.current = false;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const observer = new ResizeObserver(() => {
      if (followRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  return { scrollRef, contentRef, follow, scrollToBottom, onScroll, onWheel };
}
