import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
    top.onPop?.();
    remove(top.id);
  }, [stack, remove]);
  const drop = useCallback((id: number) => setStack((s) => s.filter((e) => e.id !== id)), []);
  const api = useMemo(() => ({ push, pop, remove }), [push, pop, remove]);
  const top = topOf(stack);
  const [topNode, setTopNode] = useState<HTMLDivElement | null>(null);
  useSwipeBack(topNode, top, drop);

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
            onAnimationEnd={(e) => { if (screen.leaving && e.target === e.currentTarget) drop(screen.id); }}
          >
            <PushedScreenFrame screen={screen} covered={screen !== top} onBack={pop} />
          </div>
        ))}
      </div>
    </NavStackContext.Provider>
  );
}

/** Swipe from the left edge to go back (iOS): the top screen follows the finger; let go far or fast enough and it slides
 *  off and leaves the stack, otherwise it slides back. */
function useSwipeBack(node: HTMLDivElement | null, top: StackEntry | undefined, drop: (id: number) => void): void {
  useEdgeSwipeBack(node, () => {
    if (!top) return;
    top.onPop?.();
    drop(top.id);
  });
}

/** The page follows a swipe from the left edge; let go far or fast enough and it slides off, then `back` runs. */
function useEdgeSwipeBack(node: HTMLDivElement | null, back: () => void): void {
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
      if (!commits(dx, speed, node.offsetWidth, UI_CONFIG.gesture.edgeShare)) {
        node.style.translate = '';
        return;
      }
      slideOff(node, '100% 0', back);
    },
  });
}

/** A pushed screen's bar: a round back button, the centred title, and an optional trailing control (a form's Save). */
function BackBar({ title, onBack, action }: { title: string; onBack: () => void; action?: React.ReactNode }) {
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
      <Surface className="absolute inset-0 flex flex-col">
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
  children: React.ReactNode;
}

/** Declarative push: while `open`, a screen titled `title` is on the enclosing stack, showing `children` live (state stays with the owner). */
export function PushedScreen({ open, title, action, onClose, children }: PushedScreenProps) {
  const { push, remove } = useNavStack();
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const [actionTarget, setActionTarget] = useState<HTMLDivElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const hasAction = action !== undefined;

  // The screen is pushed once per opening; its content and bar control render live into it (portals), so typing in a
  // form never re-pushes the page.
  useEffect(() => {
    if (!open) return;
    const id = push({
      title,
      action: hasAction ? <div ref={setActionTarget} /> : undefined,
      content: <div ref={setTarget} />,
      onPop: () => close.current(),
    });
    return () => {
      remove(id);
      setTarget(null);
      setActionTarget(null);
    };
  }, [open, title, hasAction, push, remove]);

  return (
    <>
      {target && createPortal(children, target)}
      {actionTarget && createPortal(action, actionTarget)}
    </>
  );
}
