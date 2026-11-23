/** First-run screens, Apple's welcome pattern. Mac: one panel near the top of the window, its content fading between
 *  steps. iPhone: full screen, the title at the top, the main button pinned above the home indicator. */

import React from 'react';
import { useFormFactor } from '@platform/formFactor';
import { Button } from './button';
import { Card } from './card';
import { IconTile } from './icon-tile';
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
      <Surface as="main" variant="grouped" className="flex h-dvh flex-col pt-safe-top">
        <div key={stepKey} className="flex min-h-0 flex-1 flex-col animate-fade-in">{children}</div>
      </Surface>
    );
  }
  return (
    <Surface as="main" variant="page" className="relative flex h-dvh justify-center overflow-y-auto px-6 pb-6 pt-welcome-top">
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
  /** An image above the title (the app icon on the first screen). */
  icon?: string;
  title: string;
  subtitle?: string;
  /** The step's main action (Continue). */
  primary?: WelcomeAction;
  /** The way past it (Set up later, Back). */
  secondary?: WelcomeAction;
  /** The step's content; a step whose title and line say it all has none. */
  children?: React.ReactNode;
}

/** One step: title (and a line under it), the content, then its actions. */
export function WelcomeStep({ icon, title, subtitle, primary, secondary, children }: WelcomeStepProps) {
  const phone = useFormFactor() === 'phone';
  const header = (
    <header className="flex flex-col items-center gap-2 text-center">
      {icon && <img src={icon} alt="" className="mb-2 h-welcome-icon w-welcome-icon" />}
      <Text as="h1" variant={phone ? 'display' : 'pageTitle'}>{title}</Text>
      {subtitle && <Text as="p" variant="helper" tone="muted">{subtitle}</Text>}
    </header>
  );
  const actions = (primary || secondary) && (
    <div className="flex w-full flex-col items-center gap-3">
      {primary && (
        <Button variant="primary" size={phone ? 'lg' : 'md'} onClick={primary.onClick} disabled={primary.disabled} className={phone ? 'w-full' : undefined}>
          {primary.label}
        </Button>
      )}
      {secondary && <Button variant="link" size="inline" onClick={secondary.onClick} disabled={secondary.disabled}>{secondary.label}</Button>}
    </div>
  );

  if (phone) {
    return (
      <>
        {/* The title at the top (iOS setup screens); the step's card centred in the space below it (my-auto never clips
            the top, so it scrolls instead when it doesn't fit). */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 py-section">
          {header}
          {children && <div className="my-auto flex flex-col gap-section pt-section">{children}</div>}
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
  /** The feature's icon art, already in the current appearance. */
  image: string;
  title: string;
  children: React.ReactNode;
}

/** A welcome screen's "what it does" lines: one inset card of rows on a phone (iOS grouped list), a spaced list in the
 *  Mac's panel (already a card). */
export function FeatureList({ children }: { children: React.ReactNode }) {
  return useFormFactor() === 'phone' ? <Card>{children}</Card> : <div className="flex flex-col gap-3">{children}</div>;
}

/** One line of it: its icon art, a headline and one sentence. */
export function FeatureRow({ image, title, children }: FeatureRowProps) {
  return (
    <div className="flex items-center gap-row-icon py-3">
      <IconTile image={image} />
      <div className="min-w-0 flex-1">
        <Text as="p" variant="bodyStrong">{title}</Text>
        <Text as="p" variant="helper" tone="muted">{children}</Text>
      </div>
    </div>
  );
}
