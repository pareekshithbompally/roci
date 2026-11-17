import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { IconButton } from './button';
import { Surface } from './surface';
import { Text } from './text';

export interface NavScreen {
  title: string;
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

/** A pushed screen with a stable identity (keys survive pop-then-push). */
interface StackEntry extends NavScreen {
  id: number;
}

/** One screen: its header, then its own scrolling body. `covered`: a screen is pushed over it, so it is inert. */
function Screen({ header, covered, children }: { header: React.ReactNode; covered: boolean; children: React.ReactNode }) {
  return (
    <Surface variant="page" inert={covered || undefined} className="absolute inset-0 flex flex-col">
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto pb-safe-bottom">{children}</div>
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
  useEffect(() => ref.current?.focus(), []);
  return (
    <div ref={ref} tabIndex={-1} className="min-w-0 outline-none">
      <Text as="h1" variant="bodyStrong" truncate>{title}</Text>
    </div>
  );
}

export function NavStack({ title, action, initial, children }: NavStackProps) {
  const nextId = useRef(0);
  const entry = useCallback((screen: NavScreen): StackEntry => ({ ...screen, id: nextId.current++ }), []);
  const [stack, setStack] = useState<StackEntry[]>(() => (initial ? [entry(initial)] : []));
  const push = useCallback((screen: NavScreen) => {
    const next = entry(screen);
    setStack((s) => [...s, next]);
    return next.id;
  }, [entry]);
  const pop = useCallback(() => {
    stack.at(-1)?.onPop?.();
    setStack((s) => s.slice(0, -1));
  }, [stack]);
  const remove = useCallback((id: number) => setStack((s) => s.filter((screen) => screen.id !== id)), []);
  const api = useMemo(() => ({ push, pop, remove }), [push, pop, remove]);

  return (
    <NavStackContext.Provider value={api}>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <Screen
          covered={stack.length > 0}
          header={
            <header className="flex shrink-0 items-start justify-between gap-2 px-4 pt-2">
              <Text as="h1" variant="display" className="pt-10">{title}</Text>
              {action}
            </header>
          }
        >
          {children}
        </Screen>
        <AnimatePresence initial={false}>
          {stack.map((screen, depth) => (
            <motion.div
              key={screen.id}
              className="absolute inset-0"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={ANIMATION_CONFIG.navigation.push}
            >
              <Screen
                covered={depth < stack.length - 1}
                header={
                  <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pt-2 pb-3">
                    <IconButton icon={ChevronLeft} label="Back" size="fab" variant="outline" onClick={pop} className="justify-self-start" />
                    <PushedTitle title={screen.title} />
                  </header>
                }
              >
                {screen.content}
              </Screen>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </NavStackContext.Provider>
  );
}

interface PushedScreenProps {
  open: boolean;
  title: string;
  /** The user went Back. */
  onClose: () => void;
  children: React.ReactNode;
}

/** Declarative push: while `open`, a screen titled `title` is on the enclosing stack, showing `children` live (state stays with the owner). */
export function PushedScreen({ open, title, onClose, children }: PushedScreenProps) {
  const { push, remove } = useNavStack();
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const id = push({ title, content: <div ref={setTarget} />, onPop: () => close.current() });
    return () => {
      remove(id);
      setTarget(null);
    };
  }, [open, title, push, remove]);

  return target ? createPortal(children, target) : null;
}
