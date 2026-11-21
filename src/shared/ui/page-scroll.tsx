import { forwardRef, type HTMLAttributes } from 'react';
import { platform } from '@platform/index';
import { UI_CONFIG } from '@config/ui.config';
import { edgeFade } from './fade';
import { cn } from './utils';

const { safeArea } = UI_CONFIG.layout.titlebar;
const { edgeFadePx } = UI_CONFIG.layout.pageScroll;

/** Empty room that keeps content clear of a band (the titlebar, a faded edge). */
function Band({ height }: { height: number }) {
  return <div aria-hidden className="shrink-0" style={{ height }} />;
}

/** The window's drag strip across the titlebar; geometry from UI_CONFIG so padding and drag region agree. */
export function TitlebarDragRegion() {
  const { dragOffset, dragHeight } = UI_CONFIG.layout.titlebar;
  return <div className="fixed w-full z-20 select-none" style={{ top: dragOffset, height: dragHeight }} data-tauri-drag-region />;
}

/** Reserves the titlebar band (traffic lights + drag strip) above a view's fixed header. */
export function TitlebarSpacer() {
  return platform.hasWindowChrome ? <Band height={safeArea} /> : null;
}

export interface PageScrollProps extends HTMLAttributes<HTMLDivElement> {
  /** Runs to the window top: content starts below the titlebar and fades out under it when scrolled. */
  underTitlebar?: boolean;
  /** Content fades out at the bottom edge too (into a composer below). Scrolled to the end, the last content rests above the fade. */
  fadeBottom?: boolean;
  /** The scrollbar keeps its room even when the page fits, so a centred column sits in the same place on every page. */
  steady?: boolean;
}

/** A view's vertical page scroller with edge fades; callers add layout and padding. Use `ScrollArea` for insets. */
export const PageScroll = forwardRef<HTMLDivElement, PageScrollProps>(
  ({ underTitlebar = true, fadeBottom = false, steady = false, className, style, children, ...props }, ref) => {
    const fade = edgeFade({ top: underTitlebar ? safeArea : 0, bottom: fadeBottom ? edgeFadePx : 0 });
    return (
      <div
        ref={ref}
        className={cn('min-h-0 custom-scrollbar', steady ? 'overflow-y-scroll' : 'overflow-y-auto', className)}
        style={{ ...fade, ...style }}
        {...props}
      >
        {underTitlebar && <TitlebarSpacer />}
        {children}
        {fadeBottom && <Band height={edgeFadePx} />}
      </div>
    );
  },
);
PageScroll.displayName = 'PageScroll';
