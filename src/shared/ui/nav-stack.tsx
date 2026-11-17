import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { IconButton } from './button';
import { Surface } from './surface';
import { Text } from './text';

export interface NavScreen {
  title: string;
  content: React.ReactNode;
}

interface NavStackApi {
  push: (screen: NavScreen) => void;
  pop: () => void;
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
  const push = useCallback((screen: NavScreen) => setStack((s) => [...s, entry(screen)]), [entry]);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const api = useMemo(() => ({ push, pop }), [push, pop]);

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
