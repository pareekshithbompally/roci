import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from './button';
import { Surface } from './surface';
import { PageScroll, TitlebarSpacer } from './page-scroll';
import { Text } from './text';
import { cn } from './utils';
import { UI_CONFIG } from '@config/ui.config';
import { commits, slideOff, useTouchDrag } from './touch-drag';
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
}

/** One screen: its header, then its own scrolling body. `covered`: a screen is pushed over it, so it is inert. */
function Screen({ header, covered, children }: { header: React.ReactNode; covered: boolean; children: React.ReactNode }) {
  return (
    <Surface variant="grouped" inert={covered || undefined} className="absolute inset-0 flex flex-col">
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
  const api = useMemo(() => ({ push, pop, remove }), [push, pop, remove]);
  const top = topOf(stack);
  const [topNode, setTopNode] = useState<HTMLDivElement | null>(null);
  useSwipeBack(topNode, top, drop, remove);

  return (
    <NavStackContext.Provider value={api}>
      <div className="relative min-h-0 flex-1 overflow-hidden">
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
        {stack.map((screen) => (
          <div
            key={screen.id}
            ref={screen === top ? setTopNode : undefined}
            className={cn(
              'absolute inset-0 transition-[translate] duration-ios ease-ios data-[dragging]:transition-none',
              screen.leaving ? 'animate-push-out' : !screen.still && 'animate-push-in',
            )}
            onAnimationEnd={(e) => {
              if (e.target !== e.currentTarget) return;
              if (screen.leaving) drop(screen.id);
              else focusField(e.currentTarget);
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

/** Swipe from the left edge to go back (iOS): the top screen follows the finger; let go far or fast enough and it slides
 *  off and leaves the stack, otherwise (or when it asks first) it slides back. */
function useSwipeBack(node: HTMLDivElement | null, top: StackEntry | undefined, drop: (id: number) => void, remove: (id: number) => void): void {
  const leave = (take: (id: number) => void) => () => {
    if (!top) return;
    top.onPop?.();
    take(top.id);
  };
  useEdgeSwipeBack(node, leave(drop), () => !!top && asksFirst(top, leave(remove)));
}

/** The page follows a swipe from the left edge; let go far or fast enough and it slides off, then `back` runs. `stays`:
 *  asked at that point; true slides it back instead. */
function useEdgeSwipeBack(node: HTMLDivElement | null, back: () => void, stays?: () => boolean): void {
  useTouchDrag(node, {
    axis: 'x',
    edgeOnly: true,
    onMove: (dx) => {
      if (!node) return;
      node.dataset.dragging = '';
      node.style.translate = `${Math.max(0, dx)}px 0`;
    },
    onEnd: (dx, speed) => {
      if (!node) return;
      delete node.dataset.dragging;
      if (!commits(dx, speed, node.offsetWidth, UI_CONFIG.gesture.edgeShare) || stays?.()) {
        node.style.translate = '';
        return;
      }
      slideOff(node, '100% 0', back);
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
  title: string;
  /** The user went Back (the bar's button or a swipe from the left edge). */
  onBack: () => void;
  children: React.ReactNode;
}

/** One page pushed over a view that is not a stack (a list's open item on iPhone): the stack's own bar and push, and a
 *  swipe from the left edge to go back. It covers the view it was opened from. */
export function PushedPage({ title, onBack, children }: PushedPageProps) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  useEdgeSwipeBack(node, onBack);
  return (
    <div ref={setNode} className="absolute inset-0 z-10 animate-push-in transition-[translate] duration-ios ease-ios data-[dragging]:transition-none">
      {/* Over a whole place (the shell's bar gone), so it clears the status bar itself. */}
      <Surface className="absolute inset-0 flex flex-col pt-safe-top">
        <TitlebarSpacer />
        <BackBar title={title} onBack={onBack} />
        <PageScroll underTitlebar={false} className="flex-1 pb-safe-bottom">{children}</PageScroll>
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
