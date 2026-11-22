/** A screen's commands (a recording's Pause / Stop): in its header on a Mac, in a toolbar above the home indicator on a
 *  phone (Voice Memos), so Stop is always one tap away. A screen places it at both spots; each renders only where it
 *  belongs on this device, and tells the buttons inside their size. */

import React, { createContext, useContext } from 'react';
import { useFormFactor } from '@platform/formFactor';

type BarButtonSize = 'sm' | 'fab';

const BarSize = createContext<BarButtonSize>('sm');

/** The size buttons take inside the command bar they sit in: compact in a Mac header, thumb-sized in a phone toolbar. */
export const useCommandBarSize = (): BarButtonSize => useContext(BarSize);

export interface CommandBarProps {
  placement: 'header' | 'bottom';
  children: React.ReactNode;
}

export function CommandBar({ placement, children }: CommandBarProps) {
  const phone = useFormFactor() === 'phone';
  if ((placement === 'bottom') !== phone) return null;
  if (placement === 'header') return <BarSize.Provider value="sm">{children}</BarSize.Provider>;
  return (
    <div className="flex shrink-0 justify-center pt-3 pb-sheet-end">
      <BarSize.Provider value="fab">{children}</BarSize.Provider>
    </div>
  );
}
