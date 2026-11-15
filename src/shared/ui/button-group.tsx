import React from 'react';
import { Surface, Separator } from './surface';

/** Joined icon buttons on one recessed pill with hairlines between them, e.g. Copy plus its options menu. */
export function ButtonGroup({ children }: { children: React.ReactNode }) {
  const parts = React.Children.toArray(children);
  return (
    <Surface variant="inset" radius="md" className="flex items-center shrink-0">
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Separator orientation="vertical" className="h-3.5" />}
          {part}
        </React.Fragment>
      ))}
    </Surface>
  );
}
