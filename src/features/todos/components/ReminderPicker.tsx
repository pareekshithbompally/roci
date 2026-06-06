/**
 * ReminderPicker — Popover for setting/editing a todo reminder.
 * Uses Radix Popover from shared/ui and native date/time inputs.
 */

import React, { useState, useMemo } from 'react';
import { Bell, BellRing, X, Clock } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent, DatePicker, TimePicker } from '@shared/ui';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import { reminderService } from '@services/reminder.service';
import type { ScheduleReminderParams } from '@services/reminder.service';
import { parseDateLoose, localDateFromParts } from '@shared/utils/todo.utils';

interface ReminderPickerProps {
  todoId: string;
  meetingId: string;
  todoText: string;
  meetingTitle: string;
  /** Currently active reminder ISO datetime, if any */
  reminderDateTime?: string;
  /** Due date string from the todo (may be loose format) */
  dueDate?: string;
  onReminderSet: (dateTime: string | null) => void;
}

interface QuickOption {
  label: string;
  getDate: () => Date;
}

function buildQuickOptions(dueDate?: string): QuickOption[] {
  const options: QuickOption[] = [
    {
      label: 'In 1 hour',
      getDate: () => new Date(Date.now() + 60 * 60 * 1000),
    },
    {
      label: 'In 3 hours',
      getDate: () => new Date(Date.now() + 3 * 60 * 60 * 1000),
    },
    {
      label: 'Tomorrow at 9:00 AM',
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
        label: `On due date (${parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}) at 9:00 AM`,
        getDate: () => {
          const d = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 9, 0, 0, 0);
          return d;
        },
      });
    }
  }

  return options;
}

/** Format ISO datetime to local date string for <input type="date"> */
function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format ISO datetime to local time string for <input type="time"> */
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
        todoText: todoText.length > 80 ? todoText.slice(0, 77) + '…' : todoText,
        meetingTitle,
        reminderDateTime: iso,
      };
      const ok = await reminderService.schedule(params);
      if (ok) {
        onReminderSet(iso);
        setOpen(false);
        setShowCustom(false);
      }
    } catch (error) {
      console.error('[ReminderPicker] Failed to schedule:', error);
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
  const minDate = new Date().toISOString().split('T')[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`p-1 rounded transition-colors ${
            hasReminder
              ? 'text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/20'
              : `${TEXT.muted} ${SURFACE.hoverSubtle}`
          }`}
          aria-label={hasReminder ? 'Edit reminder' : 'Set reminder'}
          title={hasReminder
            ? `Reminder: ${new Date(reminderDateTime!).toLocaleString()}`
            : 'Set reminder'
          }
        >
          {hasReminder ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-0" align="end" sideOffset={8}>
        <div className="p-3 space-y-1">
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-semibold ${TEXT.secondary}`}>
              {hasReminder ? 'Reminder Set' : 'Set Reminder'}
            </span>
            {hasReminder && (
              <button
                onClick={handleClearReminder}
                disabled={isScheduling}
                className="text-xs text-red-500 hover:text-red-600 font-medium disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>

          {/* Active reminder display */}
          {hasReminder && (
            <div className={`flex items-center gap-2 px-2.5 py-2 rounded-lg ${SURFACE.chip} mb-2`}>
              <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className={`text-xs ${TEXT.primary}`}>
                {new Date(reminderDateTime!).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </div>
          )}

          {/* Quick options */}
          {quickOptions.map((option, i) => (
            <button
              key={i}
              onClick={() => handleQuickOption(option)}
              disabled={isScheduling}
              className={`w-full text-left px-2.5 py-2 rounded-lg text-xs ${TEXT.secondary} ${SURFACE.hoverSubtle} transition-colors disabled:opacity-50`}
            >
              {option.label}
            </button>
          ))}

          {/* Custom toggle */}
          {!showCustom ? (
            <button
              onClick={() => {
                setShowCustom(true);
                if (reminderDateTime) {
                  setCustomDate(toDateInputValue(reminderDateTime));
                  setCustomTime(toTimeInputValue(reminderDateTime));
                }
              }}
              className={`w-full text-left px-2.5 py-2 rounded-lg text-xs ${TEXT.secondary} ${SURFACE.hoverSubtle} transition-colors`}
            >
              Custom date & time…
            </button>
          ) : (
            <div className={`space-y-2 pt-2 border-t ${BORDER.default}`}>
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
                  className="w-[100px]"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowCustom(false)}
                  className={`px-2.5 py-1 rounded-md text-xs ${TEXT.muted} ${SURFACE.hoverSubtle}`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCustomSchedule}
                  disabled={!customDate || isScheduling}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium ${COMPONENT.primaryButton} disabled:opacity-50`}
                >
                  Set
                </button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ReminderPicker;
