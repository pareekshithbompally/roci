/** First-run screens, Apple's welcome pattern. Mac: one panel near the top of the window, its content fading between
 *  steps. iPhone: full screen, the title at the top, the main button pinned above the home indicator. */

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { useFormFactor } from '@platform/formFactor';
import { Button } from './button';
import { Icon } from './icon';
import { Surface } from './surface';
import { Text } from './text';
import { TitlebarDragRegion } from './page-scroll';

export interface WelcomeFrameProps {
  /** Changes per step: the content fades in anew, the frame stays put. */
  stepKey: string;
  children: React.ReactNode;
}

export function WelcomeFrame({ stepKey, children }: WelcomeFrameProps) {
  const phone = useFormFactor() === 'phone';
  if (phone) {
    return (
      <Surface as="main" variant="page" className="flex h-screen flex-col pt-safe-top">
        <div key={stepKey} className="flex min-h-0 flex-1 flex-col animate-fade-in">{children}</div>
      </Surface>
    );
  }
  return (
    <Surface as="main" variant="page" className="relative flex h-screen justify-center overflow-y-auto px-6 pb-6 pt-welcome-top">
      <TitlebarDragRegion />
      <Surface variant="card" radius="xl" edge="all" className="h-fit w-full max-w-lg p-8 animate-sheet-show">
        <div key={stepKey} className="animate-fade-in">{children}</div>
      </Surface>
    </Surface>
  );
}

export interface WelcomeAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface WelcomeStepProps {
  title: string;
  subtitle?: string;
  /** The step's main action (Continue). */
  primary?: WelcomeAction;
  /** The way past it (Set up later, Back). */
  secondary?: WelcomeAction;
  children: React.ReactNode;
}

/** One step: title (and a line under it), the content, then its actions. */
export function WelcomeStep({ title, subtitle, primary, secondary, children }: WelcomeStepProps) {
  const phone = useFormFactor() === 'phone';
  const header = (
    <header className="flex flex-col items-center gap-2 text-center">
      <Text as="h1" variant={phone ? 'display' : 'pageTitle'}>{title}</Text>
      {subtitle && <Text as="p" variant="helper" tone="muted">{subtitle}</Text>}
    </header>
  );
  const actions = (primary || secondary) && (
    <div className="flex w-full flex-col items-center gap-3">
      {primary && (
        <Button variant="accent" size={phone ? 'lg' : 'md'} onClick={primary.onClick} disabled={primary.disabled} className={phone ? 'w-full' : undefined}>
          {primary.label}
        </Button>
      )}
      {secondary && <Button variant="link" size="inline" onClick={secondary.onClick} disabled={secondary.disabled}>{secondary.label}</Button>}
    </div>
  );

  if (phone) {
    return (
      <>
        <div className="flex min-h-0 flex-1 flex-col gap-section overflow-y-auto px-6 pb-6 pt-section">
          {header}
          {children}
        </div>
        {actions && <footer className="shrink-0 px-6 pb-sheet-end pt-3">{actions}</footer>}
      </>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {header}
      {children}
      {actions}
    </div>
  );
}

export interface FeatureRowProps {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}

/** A welcome screen's "what it does" line: an accent glyph, a headline and one sentence. */
export function FeatureRow({ icon, title, children }: FeatureRowProps) {
  return (
    <div className="flex items-start gap-4">
      <Icon icon={icon} size="xl" tone="accent" className="shrink-0" />
      <div className="min-w-0 flex-1">
        <Text as="p" variant="bodyStrong">{title}</Text>
        <Text as="p" variant="helper" tone="muted">{children}</Text>
      </div>
    </div>
  );
}
