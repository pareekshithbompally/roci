import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from './utils';
import { Surface } from './surface';
import { TopBar } from './top-bar';
import { Button } from './button';
import { Icon } from './icon';

export interface PushScreenProps {
  open: boolean;
  title: React.ReactNode;
  onBack: () => void;
  /** The back button's label: the screen underneath (Settings). */
  backLabel: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}

/** A pushed screen (iOS navigation stack): slides in from the right over its positioned parent; Back or Escape pops it. */
export function PushScreen({ open, title, onBack, backLabel, trailing, children }: PushScreenProps) {
  const backOnEscape = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onBack();
  };
  return (
    <Surface
      variant="page"
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      onKeyDown={backOnEscape}
      className={cn('absolute inset-0 z-30 flex flex-col transition-transform duration-300 ease-out', !open && 'pointer-events-none translate-x-full')}
    >
      <TopBar
        leading={
          <Button variant="link" size="inline" onClick={onBack}>
            <Icon icon={ChevronLeft} size="sm" />
            {backLabel}
          </Button>
        }
        title={title}
        trailing={trailing}
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-safe-bottom">{children}</div>
    </Surface>
  );
}
