/** A dated view's heading (Upcoming): the month as the title, the year beside it, then back · forward in one capsule, as
 *  Apple's Calendar heads a week. The title opens the system date picker; the arrows step by the view's span. */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton, ButtonCapsule } from './button';
import { DatePicker } from './date-picker';
import { Text } from './text';
import { formatMonthName, formatYear } from '@shared/utils/formatters';
import { localDayKey } from '@shared/utils/localDate';
import { KIT_COPY } from '@config/kitCopy.config';

export interface DateStepperProps {
  /** The day on screen: its month and year head the view. */
  date: Date;
  /** What one step moves ("day", "week"), for VoiceOver. */
  unit: string;
  onStep: (direction: 1 | -1) => void;
  /** A day chosen in the date picker (YYYY-MM-DD). */
  onPick: (day: string) => void;
}

export function DateStepper({ date, unit, onStep, onPick }: DateStepperProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <DatePicker plain value={localDayKey(date)} onChange={(day) => day && onPick(day)} placeholder={KIT_COPY.goToDate} className="min-w-0">
        <Text variant="display" truncate className="min-w-0">
          {formatMonthName(date)} <Text variant="inherit" tone="muted" className="font-normal">{formatYear(date)}</Text>
        </Text>
      </DatePicker>
      <ButtonCapsule label={KIT_COPY.stepDate(unit)}>
        <IconButton icon={ChevronLeft} label={KIT_COPY.previous(unit)} size="sm" onClick={() => onStep(-1)} />
        <IconButton icon={ChevronRight} label={KIT_COPY.next(unit)} size="sm" onClick={() => onStep(1)} />
      </ButtonCapsule>
    </div>
  );
}
