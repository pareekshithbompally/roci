import React, { useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { cn } from './utils';
import { Icon } from './icon';
import { rowClasses } from './row';

export type DisclosureVariant = 'row' | 'inline';

export interface DisclosureProps {
  /** Header content (icon, title, meta); the kit adds the chevron. Without one, `open` alone drives the region. */
  summary?: React.ReactNode;
  children: React.ReactNode;
  /** Controlled open state; omit for uncontrolled. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** `row` (default): a list row with a chevron. `inline`: flush with the text around it, no chevron. */
  variant?: DisclosureVariant;
  className?: string;
}

/** The summary's shape and the content's indent for each variant; a summary is a secondary line (callout type). */
const VARIANTS = {
  row: { summary: rowClasses(false, 'sm'), content: 'pt-1 pb-2 pl-5.5' },
  inline: { summary: 'flex w-full min-h-control-sm items-center gap-2 text-left text-callout cursor-pointer min-w-0 transition-opacity hover:opacity-80', content: 'pt-1 pb-2' },
} as const;

const COLLAPSED = { height: 0, opacity: 0 };
const EXPANDED = { height: 'auto', opacity: 1 };

/** Collapsible section that animates height and fade, instantly under Reduce Motion, never on first render. */
export function Disclosure({ summary, children, open, defaultOpen = false, onOpenChange, variant = 'row', className }: DisclosureProps) {
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
      {summary !== undefined && (
        <button type="button" aria-expanded={isOpen} aria-controls={regionId} onClick={toggle} className={VARIANTS[variant].summary}>
          {variant === 'row' && (
            <Icon icon={ChevronRight} size="xs" tone="faint" className={cn('shrink-0 transition-transform', isOpen && 'rotate-90')} />
          )}
          {summary}
        </button>
      )}
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
            <div className={summary !== undefined ? VARIANTS[variant].content : undefined}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
