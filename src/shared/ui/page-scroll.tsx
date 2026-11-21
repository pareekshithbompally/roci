import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { platform } from '@platform/index';
import { UI_CONFIG } from '@config/ui.config';
import { LAYOUT } from '@config/layout.config';
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
  /** Below a fixed header instead of the titlebar: content fades out at the top edge as it scrolls under the header; at rest
   *  it starts below the fade. */
  fadeTop?: boolean;
  /** Content fades out at the bottom edge too (into a composer below). Scrolled to the end, the last content rests above the fade. */
  fadeBottom?: boolean;
  /** The scrollbar keeps its room even when the page fits, so a centred column sits in the same place on every page. */
  steady?: boolean;
}

/** A view's vertical page scroller with edge fades; callers add layout and padding. Use `ScrollArea` for insets. */
export const PageScroll = forwardRef<HTMLDivElement, PageScrollProps>(
  ({ underTitlebar = true, fadeTop = false, fadeBottom = false, steady = false, className, style, children, ...props }, ref) => {
    const top = underTitlebar ? safeArea : fadeTop ? edgeFadePx : 0;
    const fade = edgeFade({ top, bottom: fadeBottom ? edgeFadePx : 0 });
    return (
      <div
        ref={ref}
        className={cn('min-h-0 custom-scrollbar', steady ? 'overflow-y-scroll' : 'overflow-y-auto', className)}
        style={{ ...fade, ...style }}
        {...props}
      >
        {underTitlebar && <TitlebarSpacer />}
        {!underTitlebar && fadeTop && <Band height={edgeFadePx} />}
        {children}
        {fadeBottom && <Band height={edgeFadePx} />}
      </div>
    );
  },
);
PageScroll.displayName = 'PageScroll';

/** Room under a reading view's header before its content: the height its content fades through. */
export const VIEW_FADE_PX = edgeFadePx;

export interface ViewScrollProps {
  /** Content fades under the header; off where the view pins its own headings at the top (To-dos' meeting groups). */
  fade?: boolean;
  /** The column's own layout (spacing, its inner gutter). */
  className?: string;
  children?: ReactNode;
}

/** A reading view's page under its ViewHeader: it scrolls in the view gutter, its content in the page column lined up with
 *  the header's (the scrollbar's room kept, as the header keeps it). */
export function ViewScroll({ fade = true, className, children }: ViewScrollProps) {
  return (
    <PageScroll steady underTitlebar={false} fadeTop={fade} className={cn('min-h-0 flex-1', LAYOUT.viewGutter)}>
      <div className={cn(LAYOUT.pageColumn, className)}>{children}</div>
    </PageScroll>
  );
}
