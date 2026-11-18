import React from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { cn } from './utils';
import { useFormFactor } from '@platform/formFactor';
import { POPUP_BUTTON, POPUP_CHEVRON, POPUP_VALUE } from './recipes';

export interface PickerOption {
  value: string;
  /** The menu row. */
  label: string;
  /** The button's text once chosen, when shorter than the row (the row may say "Download …" or a status). */
  title?: string;
  disabled?: boolean;
}

export interface PickerGroup {
  /** Heading of the group in the menu; none for a lone or leading group. */
  label?: string;
  options: PickerOption[];
}

export interface PickerProps {
  /** What it picks (VoiceOver). */
  label: string;
  value: string | undefined;
  groups: PickerGroup[];
  onChange: (value: string) => void;
  /** Shown while nothing is chosen. */
  placeholder: string;
  /** Beside the chosen value (a model's logo). */
  leading?: React.ReactNode;
  disabled?: boolean;
}

/**
 * The system pop-up menu: a real `<select>` under the visible value, so a tap opens the platform's own menu (iOS UIMenu,
 * macOS pop-up). The visible part hugs the chosen value — a plain value on a phone, a pop-up button on a Mac.
 */
export function Picker({ label, value, groups, onChange, placeholder, leading, disabled }: PickerProps) {
  const phone = useFormFactor() === 'phone';
  const chosen = groups.flatMap((g) => g.options).find((o) => o.value === value);
  return (
    <span className={cn(phone ? POPUP_VALUE : POPUP_BUTTON, 'relative inline-flex min-w-0 max-w-full items-center gap-2', !chosen && 'text-faint')}>
      {chosen && leading}
      <span className="min-w-0 truncate">{chosen ? (chosen.title ?? chosen.label) : placeholder}</span>
      <ChevronsUpDown aria-hidden className={phone ? POPUP_CHEVRON.phone : POPUP_CHEVRON.mac} />
      <select
        aria-label={label}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
      >
        {!chosen && <option value="" disabled>{placeholder}</option>}
        {groups.map((group, i) => (group.label
          ? (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
            </optgroup>
          )
          : group.options.map((o) => <option key={`${i}-${o.value}`} value={o.value} disabled={o.disabled}>{o.label}</option>)))}
      </select>
    </span>
  );
}
