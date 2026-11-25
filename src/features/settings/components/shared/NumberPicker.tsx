/** A pop-up of numbered choices, as a setting stores them (a number); `placeholder` shows while the value is none of them. */

import React from 'react';
import { Picker } from '@shared/ui';
import { LAYOUT } from '@config/layout.config';

export interface NumberChoice {
  value: number;
  label: string;
}

export const NumberPicker: React.FC<{
  label: string;
  value: number | undefined;
  options: NumberChoice[];
  placeholder?: string;
  onChange: (value: number) => void;
}> = ({ label, value, options, placeholder = '', onChange }) => (
  <div className={LAYOUT.capabilityPicker}>
    <Picker
      label={label}
      value={value === undefined ? undefined : String(value)}
      onChange={(next) => onChange(Number(next))}
      placeholder={placeholder}
      groups={[{ options: options.map((o) => ({ value: String(o.value), label: o.label })) }]}
    />
  </div>
);
