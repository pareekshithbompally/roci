/** A scroller whose edges fade only while content runs past them: at rest nothing is faded or cut, scrolling eases a fade
 *  in at the top, and the end of the list eases the bottom one out. Driven by the scroll and resize events, never polled. */

import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from './utils';

interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** Sub-pixel scroll positions (Retina, zoom) still count as the edge. */
const EDGE_SLACK_PX = 1;

/** Which edges have content beyond them. */
export function fadingEdges({ scrollTop, scrollHeight, clientHeight }: ScrollMetrics): { top: boolean; bottom: boolean } {
  return {
    top: scrollTop > EDGE_SLACK_PX,
    bottom: scrollTop + clientHeight < scrollHeight - EDGE_SLACK_PX,
  };
}

/** The edges to fade, updated on scroll and whenever the scroller or its content changes size. */
function useFadingEdges(scroller: React.RefObject<HTMLDivElement | null>, content: React.RefObject<HTMLDivElement | null>) {
  const [top, setTop] = useState(false);
  const [bottom, setBottom] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => {
      const edges = fadingEdges(el);
      setTop(edges.top);
      setBottom(edges.bottom);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(el);
    if (content.current) resize.observe(content.current);
    return () => {
      el.removeEventListener('scroll', update);
      resize.disconnect();
    };
  }, [scroller, content]);
  return { top, bottom };
}

export const FadeScroll = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, children, ...props }, ref) => {
  const scroller = useRef<HTMLDivElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  const edges = useFadingEdges(scroller, content);
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    scroller.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);
  return (
    <div
      ref={setRefs}
      className={cn('min-h-0 overflow-y-auto overflow-x-hidden scrollbar-overlay fade-scroll', className)}
      data-fade-top={edges.top || undefined}
      data-fade-bottom={edges.bottom || undefined}
      {...props}
    >
      <div ref={content}>{children}</div>
    </div>
  );
});
FadeScroll.displayName = 'FadeScroll';
