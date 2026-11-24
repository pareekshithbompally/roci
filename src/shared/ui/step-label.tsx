/** A span stepped back and forward (Screen Time's ‹ This Week ›): its name centred between two round grey arrows; forward
 *  stops at the span holding today. */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from './button';
import { Text } from './text';

export interface StepLabelProps {
  label: string;
  onStep: (by: 1 | -1) => void;
  /** Whether a later span exists (none past today). */
  canStepForward: boolean;
  previousLabel: string;
  nextLabel: string;
}

export function StepLabel({ label, onStep, canStepForward, previousLabel, nextLabel }: StepLabelProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <IconButton icon={ChevronLeft} label={previousLabel} size="sm" variant="outline" onClick={() => onStep(-1)} />
      <Text variant="headline" truncate>{label}</Text>
      <IconButton icon={ChevronRight} label={nextLabel} size="sm" variant="outline" disabled={!canStepForward} onClick={() => onStep(1)} />
    </div>
  );
}
