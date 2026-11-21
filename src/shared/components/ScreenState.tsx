/** A screen's data, in one of four states, the same everywhere: loading (the centred spinner), failed (a warning that says
 *  what), empty (the empty state), or its content, which arrives with the app's fade. Data loaded ahead skips loading. */

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Callout, Icon, Text, cn } from '@shared/ui';
import { errorMessage } from '@shared/utils/errors';
import { LoadingPane } from './LoadingPane';
import { EmptyState, type EmptyStateProps } from './EmptyState';

interface ScreenStateProps {
  loading?: boolean;
  /** A failed load, and what failed in words ("Couldn’t load usage"). */
  error?: { cause: unknown; title: string } | null;
  /** Set when there's nothing to show. */
  empty?: EmptyStateProps | false | null;
  /** The content's own layout (it's wrapped once, to fade in). */
  className?: string;
  /** None for a screen that's only ever loading or empty here. */
  children?: React.ReactNode;
}

export function ScreenState({ loading, error, empty, className, children }: ScreenStateProps) {
  if (loading) return <LoadingPane />;
  if (error) {
    return (
      <Callout variant="warning" icon={<Icon icon={AlertTriangle} size="sm" />}>
        <Text as="p" tone="inherit">{error.title}</Text>
        <Text as="p" variant="helper" tone="muted" className="mt-0.5">{errorMessage(error.cause)}</Text>
      </Callout>
    );
  }
  if (empty) return <EmptyState {...empty} />;
  return <div className={cn('animate-fade-in', className)}>{children}</div>;
}
