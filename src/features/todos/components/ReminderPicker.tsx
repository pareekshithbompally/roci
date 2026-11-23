/** Popover for setting or editing a todo reminder: quick options plus a custom date/time picker. */

import React, { useState, useMemo } from 'react';
import { Bell, BellRing, Clock } from 'lucide-react';
import { Button, DatePicker, Icon, Popover, PopoverContent, PopoverTrigger, Row, Separator, Surface, Text, TimePicker, showToast } from '@shared/ui';
import { openSettingsPane } from '@features/integrations/utils/openNative';
import { failureLogger } from '@shared/utils/errors';
import { TODOS_CONFIG } from '@config/todos.config';
import { reminderService } from '@services/reminder.service';
import type { ScheduleReminderParams } from '@services/reminder.service';
import { parseDateLoose, localDateFromParts, formatReminderDate } from '@shared/utils/todo.utils';
import { formatShortDateTime } from '@shared/utils/formatters';
import { localDayKey } from '@shared/utils/localDate';

interface ReminderPickerProps {
  todoId: string;
  meetingId: string | null;
  todoText: string;
  meetingTitle: string | null;
  /** Currently active reminder ISO datetime, if any */
  reminderDateTime?: string;
  /** Due date string from the todo (may be loose format) */
  dueDate?: string;
  onReminderSet: (dateTime: string | null) => void;
}

const COPY = TODOS_CONFIG.reminder;
const HOUR_MS = 60 * 60 * 1000;

const openNotificationSettings = () => void openSettingsPane('notifications-settings').catch(failureLogger('ReminderPicker')('open settings'));

interface QuickOption {
  label: string;
  getDate: () => Date;
}

function buildQuickOptions(dueDate?: string): QuickOption[] {
  const options: QuickOption[] = [
    {
      label: COPY.inOneHour,
      getDate: () => new Date(Date.now() + HOUR_MS),
    },
    {
      label: COPY.inThreeHours,
      getDate: () => new Date(Date.now() + 3 * HOUR_MS),
    },
    {
      label: COPY.tomorrowMorning,
      getDate: () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        return d;
      },
    },
  ];

  // Add "On due date" option if a parseable due date exists and is in the future
  if (dueDate) {
    const parsed = parseDateLoose(dueDate);
    if (parsed && parsed.getTime() > Date.now()) {
      options.push({
        label: COPY.onDueDate(formatShortDateTime(new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 9))),
        getDate: () => {
          const d = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 9, 0, 0, 0);
          return d;
        },
      });
    }
  }

  return options;
}

/** Format ISO datetime to local time string for TimePicker */
function toTimeInputValue(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

const ReminderPicker: React.FC<ReminderPickerProps> = ({
  todoId,
  meetingId,
  todoText,
  meetingTitle,
  reminderDateTime,
  dueDate,
  onReminderSet,
}) => {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('09:00');
  const [isScheduling, setIsScheduling] = useState(false);

  const quickOptions = useMemo(() => buildQuickOptions(dueDate), [dueDate]);
  const hasReminder = !!reminderDateTime;

  const scheduleReminder = async (dateTime: Date) => {
    if (dateTime.getTime() <= Date.now()) return;

    setIsScheduling(true);
    try {
      const iso = dateTime.toISOString();
      const params: ScheduleReminderParams = {
        todoId,
        meetingId,
        todoText,
        meetingTitle,
        reminderDateTime: iso,
      };
      const outcome = await reminderService.schedule(params);
      if (outcome === 'scheduled') {
        onReminderSet(iso);
        setOpen(false);
        setShowCustom(false);
      } else if (outcome === 'denied') {
        setOpen(false);
        showToast(TODOS_CONFIG.reminder.denied, 'warning', { label: TODOS_CONFIG.reminder.openSettings, onClick: openNotificationSettings });
      }
    } catch (error: unknown) {
      console.error('[ReminderPicker] Failed to schedule:', error);
      showToast(TODOS_CONFIG.reminder.failed, 'error');
    } finally {
      setIsScheduling(false);
    }
  };

  const handleQuickOption = (option: QuickOption) => {
    scheduleReminder(option.getDate());
  };

  const handleCustomSchedule = () => {
    if (!customDate) return;
    const date = localDateFromParts(customDate, customTime);
    if (date) scheduleReminder(date);
  };

  const handleClearReminder = async () => {
    setIsScheduling(true);
    try {
      await reminderService.cancel(todoId);
      onReminderSet(null);
      setOpen(false);
    } catch (error) {
      console.error('[ReminderPicker] Failed to cancel:', error);
    } finally {
      setIsScheduling(false);
    }
  };

  // Min date for custom picker: today
  const minDate = localDayKey(new Date());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="iconXs"
          aria-label={hasReminder ? COPY.edit : COPY.set}
          title={hasReminder
            ? COPY.at(formatReminderDate(reminderDateTime!))
            : COPY.set
          }
        >
          <Icon icon={hasReminder ? BellRing : Bell} size="sm" tone={hasReminder ? 'warning' : 'inherit'} />
        </Button>
      </PopoverTrigger>

      <PopoverContent width="md" align="end" sideOffset={8}>
        <div className="p-3 space-y-1">
          <div className="flex items-center justify-between mb-2">
            <Text variant="label" tone="muted">
              {hasReminder ? COPY.title.active : COPY.title.set}
            </Text>
            {hasReminder && (
              <Button variant="dangerGhost" size="inline" onClick={handleClearReminder} disabled={isScheduling}>
                {COPY.remove}
              </Button>
            )}
          </div>

          {/* Active reminder display */}
          {hasReminder && (
            <Surface variant="inset" radius="lg" className="flex items-center gap-2 px-2.5 py-2 mb-2">
              <Icon icon={Clock} size="xs" tone="warning" className="shrink-0" />
              <Text variant="helper">
                {formatReminderDate(reminderDateTime!)}
              </Text>
            </Surface>
          )}

          {/* Quick options */}
          {quickOptions.map((option, i) => (
            <Row
              key={i}
              onClick={() => handleQuickOption(option)}
              disabled={isScheduling}
              className="disabled:opacity-50"
            >
              {option.label}
            </Row>
          ))}

          {/* Custom toggle */}
          {!showCustom ? (
            <Row
              onClick={() => {
                setShowCustom(true);
                if (reminderDateTime) {
                  setCustomDate(localDayKey(new Date(reminderDateTime)));
                  setCustomTime(toTimeInputValue(reminderDateTime));
                }
              }}
            >
              Custom date & time…
            </Row>
          ) : (
            <div className="space-y-2">
              <Separator />
              <div className="flex gap-2 items-center">
                <DatePicker
                  value={customDate}
                  onChange={(val) => setCustomDate(val)}
                  min={minDate}
                  placeholder="Date"
                  className="flex-1"
                />
                <TimePicker
                  value={customTime}
                  onChange={(val) => setCustomTime(val)}
                  className="w-24"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowCustom(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={handleCustomSchedule}
                  disabled={!customDate || isScheduling}>
                  Set
                </Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ReminderPicker;
