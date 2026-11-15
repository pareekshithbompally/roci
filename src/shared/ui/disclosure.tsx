import React, { useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { cn } from './utils';
import { Icon } from './icon';
import { rowClasses } from './row';

export interface DisclosureProps {
  /** Header content (icon, title, meta). The chevron is added by the kit. */
  summary: React.ReactNode;
  children: React.ReactNode;
  /** Controlled open state; omit for uncontrolled. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

const COLLAPSED = { height: 0, opacity: 0 };
const EXPANDED = { height: 'auto', opacity: 1 };

/**
 * Collapsible section: a row header that toggles a region below it
 * (tool-call blocks, activity groups, advanced settings). The region opens
 * and closes smoothly (height and fade), instantly under Reduce Motion, and
 * never animates on first render.
 */
export function Disclosure({ summary, children, open, defaultOpen = false, onOpenChange, className }: DisclosureProps) {
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const isOpen = open ?? innerOpen;
  const regionId = useId();
  const transition = useReducedMotion() ? { duration: 0 } : ANIMATION_CONFIG.disclosure;

  const toggle = () => {
    const next = !isOpen;
    if (open === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div className={className}>
      <button type="button" aria-expanded={isOpen} aria-controls={regionId} onClick={toggle} className={rowClasses()}>
        <Icon icon={ChevronRight} size="xs" tone="faint" className={cn('shrink-0 transition-transform', isOpen && 'rotate-90')} />
        {summary}
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="region"
            id={regionId}
            role="region"
            className="overflow-hidden"
            initial={COLLAPSED}
            animate={EXPANDED}
            exit={COLLAPSED}
            transition={transition}
          >
            <div className="pt-1 pb-2 pl-5.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
