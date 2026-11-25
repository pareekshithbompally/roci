import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from './button';
import { Surface } from './surface';
import { PageScroll, TitlebarSpacer } from './page-scroll';
import { Text } from './text';
import { cn } from './utils';
import { UI_CONFIG } from '@config/ui.config';
import { useReducedMotion } from 'framer-motion';
import type { AnimationPlaybackControls } from 'framer-motion';
import { commits, PUSHED_PAGE_MARK, release, useTouchDrag } from './touch-drag';
import { MOTION } from '@config/motion.config';
import { KIT_COPY } from '@config/kitCopy.config';

export interface NavScreen {
  title: string;
  /** The bar's trailing control (a form's Save). */
  action?: React.ReactNode;
  content: React.ReactNode;
  /** Called when the user leaves the screen with Back. */
  onPop?: () => void;
  /** Asked before Back or a swipe leaves the screen (unsaved edits): resolves whether to leave; undefined leaves at once. */
  confirmBack?: () => Promise<boolean> | undefined;
}

/** Asks `screen` before leaving it; true when it asks (then `leave` runs on a yes), false when nothing is in the way. */
function asksFirst(screen: NavScreen, leave: () => void): boolean {
  const answer = screen.confirmBack?.();
  if (!answer) return false;
  answer
    .then((yes) => { if (yes) leave(); })
    .catch((error: unknown) => console.error('[NavStack] confirmBack failed:', error));
  return true;
}

interface NavStackApi {
  /** Pushes a screen; returns its id for `remove`. */
  push: (screen: NavScreen) => number;
  pop: () => void;
  /** Takes a screen off the stack by id (its owner closed it); no-op once it's gone. */
  remove: (id: number) => void;
}

const NavStackContext = createContext<NavStackApi | null>(null);


/** The enclosing `NavStack`, or null outside one (Mac and iPad panels drill in place instead of pushing). */
export function useOptionalNavStack(): NavStackApi | null {
  return useContext(NavStackContext);
}

/** Push and pop screens of the enclosing `NavStack`. */
export function useNavStack(): NavStackApi {
  const api = useContext(NavStackContext);
  if (!api) throw new Error('useNavStack must be used inside a NavStack');
  return api;
}

/** A pushed screen with a stable identity (keys survive pop-then-push). `leaving`: sliding out, gone when that ends.
 *  `still`: shown without the slide (the screen a sheet opens on). */
interface StackEntry extends NavScreen {
  id: number;
  leaving?: boolean;
  still?: boolean;
  /** Its slide in has played: it never plays again when the screen's other motion (parallax) ends. */
  entered?: boolean;
}

/** One screen: its header, then its own scrolling body. `covered`: a screen is pushed over it, so it is inert. */
function Screen({ header, covered, className, children }: { header: React.ReactNode; covered: boolean; className?: string; children: React.ReactNode }) {
  return (
    <Surface variant="grouped" inert={covered || undefined} className={cn('absolute inset-0 flex flex-col', className)}>
      {header}
      {/* The kit's one page scroller: vertical only, and its top edge fades under the bar once content scrolls. */}
      <PageScroll className="flex-1 pb-safe-bottom">{children}</PageScroll>
    </Surface>
  );
}

export interface NavStackProps {
  /** The root screen's large title. */
  title: string;
  /** The root screen's action at the top right (Close). */
  action?: React.ReactNode;
  /** A screen already open above the root when the stack appears (Settings opened at a panel). */
  initial?: NavScreen;
  /** The root screen's content. */
  children: React.ReactNode;
}

/** iOS navigation stack: the root has a large title, each pushed screen a round back button and a centred title; one header per screen, at any depth. */
/** A pushed screen's title takes focus as it appears, so VoiceOver starts on the new screen. */
function PushedTitle({ title }: { title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return (
    <div ref={ref} tabIndex={-1} className="min-w-0 outline-none">
      <Text as="h1" variant="headline" truncate>{title}</Text>
    </div>
  );
}

/** The screen in view: the last one not sliding out. */
const topOf = (stack: StackEntry[]): StackEntry | undefined => [...stack].reverse().find((e) => !e.leaving);

/** A screen's one slide at a time (one CSS animation, so changing it never replays another): out while it leaves, the
 *  parallax while the screen above it moves, in once when pushed. */
function slideOf(screen: StackEntry, beneath: string | undefined): string | undefined {
  if (screen.leaving) return 'animate-push-out';
  if (beneath) return beneath;
  return screen.still || screen.entered ? undefined : 'animate-push-in';
}

/** How the screen just beneath the last one moves with it (iOS parallax): aside as it is pushed, back as it leaves; none
 *  under a screen the stack opened on. */
function beneathMotion(stack: StackEntry[]): string | undefined {
  const last = stack.at(-1);
  if (!last || last.still) return undefined;
  return last.leaving ? 'animate-push-uncover' : 'animate-push-under';
}

export function NavStack({ title, action, initial, children }: NavStackProps) {
  const nextId = useRef(0);
  const entry = useCallback((screen: NavScreen): StackEntry => ({ ...screen, id: nextId.current++ }), []);
  const [stack, setStack] = useState<StackEntry[]>(() => (initial ? [{ ...entry(initial), still: true }] : []));
  const push = useCallback((screen: NavScreen) => {
    const next = entry(screen);
    setStack((s) => [...s, next]);
    return next.id;
  }, [entry]);
  // Leaving screens slide out first (CSS, on the compositor), then drop out of the stack.
  const remove = useCallback((id: number) => setStack((s) => s.map((e) => (e.id === id ? { ...e, leaving: true } : e))), []);
  const pop = useCallback(() => {
    const top = topOf(stack);
    if (!top) return;
    const leave = () => {
      top.onPop?.();
      remove(top.id);
    };
    if (!asksFirst(top, leave)) leave();
  }, [stack, remove]);
  const drop = useCallback((id: number) => setStack((s) => s.filter((e) => e.id !== id)), []);
  const entered = useCallback((id: number) => setStack((s) => s.map((e) => (e.id === id ? { ...e, entered: true } : e))), []);
  const api = useMemo(() => ({ push, pop, remove }), [push, pop, remove]);
  const top = topOf(stack);
  const [topNode, setTopNode] = useState<HTMLDivElement | null>(null);
  const [rootNode, setRootNode] = useState<HTMLDivElement | null>(null);
  // The screen beneath the top one: the one before it, or the root.
  const topIndex = top ? stack.indexOf(top) : -1;
  const [beneathNode, setBeneathNode] = useState<HTMLDivElement | null>(null);
  useSwipeBack(topNode, topIndex > 0 ? beneathNode : rootNode, top, drop, remove);
  const beneath = beneathMotion(stack);
  const beneathIndex = stack.length - 2;

  return (
    <NavStackContext.Provider value={api}>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div ref={setRootNode} className={cn('absolute inset-0', beneathIndex === -1 && beneath)}>
        <Screen
          covered={!!top}
          header={
            <header className="flex shrink-0 items-start justify-between gap-2 px-4 pt-2">
              <Text as="h1" variant="display" className="pt-10">{title}</Text>
              {action}
            </header>
          }
        >
          {children}
        </Screen>
        </div>
        {stack.map((screen, index) => (
          <div
            key={screen.id}
            ref={screen === top ? setTopNode : index === topIndex - 1 ? setBeneathNode : undefined}
            className={cn(
              'absolute inset-0 shadow-overlay',
              slideOf(screen, index === beneathIndex ? beneath : undefined),
            )}
            onAnimationEnd={(e) => {
              // Its own slide only: the parallax of a screen pushed over it ends here too.
              if (e.target !== e.currentTarget) return;
              if (e.animationName === 'push-out') drop(screen.id);
              if (e.animationName !== 'push-in') return;
              entered(screen.id);
              focusField(e.currentTarget);
            }}
          >
            <PushedScreenFrame screen={screen} covered={screen !== top} onBack={pop} />
          </div>
        ))}
      </div>
    </NavStackContext.Provider>
  );
}

/** A pushed page's field takes focus once the slide ends: focusing it earlier scrolls the page while it moves. */
function focusField(page: HTMLElement): void {
  page.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
}

/** Swipe from the left edge to go back (iOS): the top screen follows the finger, the one beneath with it; let go far or
 *  fast enough and it slides off and leaves the stack, otherwise (or when it asks first) it slides back. */
function useSwipeBack(node: HTMLDivElement | null, beneath: HTMLDivElement | null, top: StackEntry | undefined, drop: (id: number) => void, remove: (id: number) => void): void {
  const leave = (take: (id: number) => void) => () => {
    if (!top) return;
    top.onPop?.();
    take(top.id);
  };
  useEdgeSwipeBack(node, leave(drop), () => !!top && asksFirst(top, leave(remove)), beneath);
}

/** Where the screen beneath sits while the top one is `moved` px along a travel of `width` (iOS parallax). */
const beneathAt = (moved: number, width: number) => -MOTION.parallax * (width - moved);

/** Puts a dragged screen back to rest once its spring ends (no inline offset left over for a later slide). */
const rest = (node: HTMLElement) => () => { node.style.transform = ''; };

/** The page follows a swipe from the left edge, and `beneath` (the screen it covers) a share of the way; let go far or fast
 *  enough and both spring on from the finger's speed, then `back` runs; otherwise they spring back. `stays`: asked at
 *  that point; true springs it back instead. */
function useEdgeSwipeBack(node: HTMLDivElement | null, back: () => void, stays?: () => boolean, beneath?: HTMLDivElement | null): void {
  const reduce = useReducedMotion() ?? false;
  /** A spring-back still under way: a new swipe stops it and takes over. */
  const settling = useRef<AnimationPlaybackControls[]>([]);
  useTouchDrag(node, {
    axis: 'x',
    edgeOnly: true,
    onMove: (dx) => {
      if (!node) return;
      settling.current.forEach((move) => move.stop());
      settling.current = [];
      const moved = Math.max(0, dx);
      node.style.transform = `translateX(${moved}px)`;
      if (beneath) beneath.style.transform = `translateX(${beneathAt(moved, node.offsetWidth)}px)`;
    },
    onEnd: (dx, speed) => {
      if (!node) return;
      const width = node.offsetWidth;
      const moved = Math.max(0, dx);
      const goes = commits(dx, speed, width, UI_CONFIG.gesture.edgeShare) && !stays?.();
      const moves = [release(node, moved, goes ? width : 0, speed, reduce, goes ? back : rest(node))];
      if (beneath) moves.push(release(beneath, beneathAt(moved, width), goes ? 0 : beneathAt(0, width), speed * MOTION.parallax, reduce, rest(beneath)));
      // Leaving always finishes (the stack drops the screen at its end); only a spring-back can be taken over.
      settling.current = goes ? [] : moves;
    },
  });
}

/** A pushed screen's bar: a round back button, the centred title, and an optional trailing control (a form's Save). The one
 *  bar of every pushed page on iPhone: a stack's screens, a list's open item, a place opened from the sidebar. */
export function BackBar({ title, onBack, action }: { title: string; onBack: () => void; action?: React.ReactNode }) {
  return (
    <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pt-2 pb-3">
      <IconButton icon={ChevronLeft} label={KIT_COPY.back} size="fab" variant="bar" onClick={onBack} className="justify-self-start" />
      <PushedTitle title={title} />
      <div className="justify-self-end">{action}</div>
    </header>
  );
}

export interface PushedPageProps {
  /** Pushed; false slides it back out. */
  open: boolean;
  title: string;
  /** The user went Back (the bar's button or a swipe from the left edge). */
  onBack: () => void;
  children: React.ReactNode;
}

/** One page pushed over a view that is not a stack (a list's open item on iPhone): the stack's own bar, push and pop, and a
 *  swipe from the left edge to go back. It covers the view it was opened from, and leaves showing what it last showed. */
export function PushedPage({ open, title, onBack, children }: PushedPageProps) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  // Mounted while open and while it slides out.
  const [shown, setShown] = useState(open);
  const last = useRef({ title, children });
  if (open) last.current = { title, children };
  useEffect(() => {
    if (open) setShown(true);
  }, [open]);
  // A swipe has already carried it off the screen: it goes at once, with no second slide.
  useEdgeSwipeBack(node, () => {
    setShown(false);
    onBack();
  });
  if (!shown) return null;
  return (
    <div
      ref={setNode}
      {...PUSHED_PAGE_MARK}
      className={cn('absolute inset-0 z-10 shadow-overlay', open ? 'animate-push-in' : 'animate-push-out')}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && !open) setShown(false);
      }}
    >
      {/* Over a whole place (the shell's bar gone), so it clears the status bar itself; the shell already clears the home
          indicator. The place's own fill: it hides the view it covers. */}
      <Surface variant="page" className="absolute inset-0 flex flex-col pt-safe-top">
        <TitlebarSpacer />
        <BackBar title={last.current.title} onBack={onBack} />
        <PageScroll underTitlebar={false} className="flex-1">{last.current.children}</PageScroll>
      </Surface>
    </div>
  );
}

/** A pushed screen in a stack. */
function PushedScreenFrame({ screen, covered, onBack }: { screen: StackEntry; covered: boolean; onBack: () => void }) {
  return (
    <Screen covered={covered} header={<BackBar title={screen.title} onBack={onBack} action={screen.action} />}>
      {screen.content}
    </Screen>
  );
}

interface PushedScreenProps {
  open: boolean;
  title: string;
  /** The bar's trailing control (a form's Save). */
  action?: React.ReactNode;
  /** The user went Back. */
  onClose: () => void;
  /** Asked before Back leaves (unsaved edits); none leaves at once. */
  confirmBack?: () => Promise<boolean>;
  children: React.ReactNode;
}

/** A pushed page's groups, spaced like a settings list. */
export function PageBody({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-section p-4">{children}</div>;
}

type SetTarget = React.Dispatch<React.SetStateAction<HTMLDivElement | null>>;

/** A portal target that clears only itself, so a page still sliding out never clears the next one's. */
const targetRef = (set: SetTarget) => (node: HTMLDivElement | null) => {
  set(node);
  return () => set((current) => (current === node ? null : current));
};

/** Declarative push: while `open`, a screen titled `title` is on the enclosing stack, showing `children` live (state stays with the owner). */
export function PushedScreen({ open, title, action, onClose, confirmBack, children }: PushedScreenProps) {
  const { push, remove } = useNavStack();
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const [actionTarget, setActionTarget] = useState<HTMLDivElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const ask = useRef(confirmBack);
  ask.current = confirmBack;
  // What it last showed while open: a page sliding out keeps its content, whatever its owner shows by then.
  const shown = useRef({ children, action });
  if (open) shown.current = { children, action };
  const hasAction = action !== undefined;

  // The screen is pushed once per opening; its content and bar control render live into it (portals), so typing in a
  // form never re-pushes the page.
  useEffect(() => {
    if (!open) return;
    const id = push({
      title,
      action: hasAction ? <div ref={targetRef(setActionTarget)} /> : undefined,
      content: <div ref={targetRef(setTarget)} />,
      onPop: () => close.current(),
      confirmBack: () => ask.current?.(),
    });
    return () => remove(id);
  }, [open, title, hasAction, push, remove]);

  // An owner that unmounts on close takes its content with it: the page slides out showing a copy.
  useLayoutEffect(() => () => {
    if (target) target.parentNode?.appendChild(target.cloneNode(true));
  }, [target]);

  return (
    <>
      {target && createPortal(shown.current.children, target)}
      {actionTarget && createPortal(shown.current.action, actionTarget)}
    </>
  );
}
