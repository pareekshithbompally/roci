import React, { useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
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

/**
 * Collapsible section: a row header that toggles a region below it
 * (tool-call blocks, activity groups, advanced settings).
 */
export function Disclosure({ summary, children, open, defaultOpen = false, onOpenChange, className }: DisclosureProps) {
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const isOpen = open ?? innerOpen;
  const regionId = useId();

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
      {isOpen && (
        <div id={regionId} role="region" className="pt-1 pb-2 pl-5.5">
          {children}
        </div>
      )}
    </div>
  );
}
