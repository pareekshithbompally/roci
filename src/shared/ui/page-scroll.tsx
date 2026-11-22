import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { platform } from '@platform/index';
import { UI_CONFIG } from '@config/ui.config';
import { LAYOUT } from '@config/layout.config';
import { edgeFade } from './fade';
import { cn } from './utils';

const { safeArea } = UI_CONFIG.layout.titlebar;
const { edgeFadePx, viewFadePx } = UI_CONFIG.layout.pageScroll;

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
   *  it starts below the fade. `true` is the standard edge; a number is the fade's height in px. */
  fadeTop?: boolean | number;
  /** Content fades out at the bottom edge too (into a composer below). Scrolled to the end, the last content rests above the fade. */
  fadeBottom?: boolean;
  /** The scrollbar keeps its room even when the page fits, so a centred column sits in the same place on every page. */
  steady?: boolean;
}

/** A view's vertical page scroller with edge fades; callers add layout and padding. Use `ScrollArea` for insets. */
export const PageScroll = forwardRef<HTMLDivElement, PageScrollProps>(
  ({ underTitlebar = true, fadeTop = false, fadeBottom = false, steady = false, className, style, children, ...props }, ref) => {
    const band = fadeTop === true ? edgeFadePx : fadeTop || 0;
    const top = underTitlebar ? safeArea : band;
    const fade = edgeFade({ top, bottom: fadeBottom ? edgeFadePx : 0 });
    return (
      <div
        ref={ref}
        className={cn('min-h-0 custom-scrollbar', steady ? 'overflow-y-scroll' : 'overflow-y-auto', className)}
        style={{ ...fade, ...style }}
        {...props}
      >
        {underTitlebar && <TitlebarSpacer />}
        {!underTitlebar && band > 0 && <Band height={band} />}
        {children}
        {fadeBottom && <Band height={edgeFadePx} />}
      </div>
    );
  },
);
PageScroll.displayName = 'PageScroll';

/** Room under a reading view's header before its content: the height its content fades through. */
export const VIEW_FADE_PX = viewFadePx;

export interface ViewScrollProps {
  /** Content fades under the header; off where the view pins its own headings at the top (To-dos' meeting groups), which
   *  keep the same room under the header. */
  fade?: boolean;
  /** The column's own layout (spacing, its inner gutter). */
  className?: string;
  children?: ReactNode;
}

/** A reading view's page under its ViewHeader: it scrolls, its content in the view column lined up with the header's (the
 *  scrollbar's room kept, as the header keeps it). */
export function ViewScroll({ fade = true, className, children }: ViewScrollProps) {
  return (
    <PageScroll steady underTitlebar={false} fadeTop={fade && VIEW_FADE_PX} className="min-h-0 flex-1">
      {/* A full-height column, so an empty state fills what's left and centres there. */}
      <div className={cn(LAYOUT.viewColumn, 'flex min-h-full flex-col', className)} style={fade ? undefined : { paddingTop: VIEW_FADE_PX }}>{children}</div>
    </PageScroll>
  );
}

/** ViewScroll's still twin, for a view whose panes scroll on their own (Dictations' list and open dictation): the same
 *  column, gutter and room under the header, filling the view's height. */
export function ViewBody({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={cn('flex min-h-0 flex-1', LAYOUT.pageColumnFrame)} style={{ paddingTop: VIEW_FADE_PX }}>
      <div className={cn('flex min-h-0 flex-1', LAYOUT.viewColumn, LAYOUT.listGutter, className)}>{children}</div>
    </div>
  );
}
