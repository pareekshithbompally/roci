import { useFormFactor } from '@platform/formFactor';
import { Tabs, type TabsProps } from './tabs';
import { Picker } from './picker';

export type ChoiceControlProps<T extends string> = Omit<TabsProps<T>, 'fill'> & {
  /** Accessible name (what it chooses: "Theme"); the menu form has no other. */
  label: string;
};

/** A setting with a few choices: a segmented control on Mac and iPad, the system pop-up menu on a phone (iOS). */
export function ChoiceControl<T extends string>({ items, value, onValueChange, label, className }: ChoiceControlProps<T>) {
  const phone = useFormFactor() === 'phone';
  if (!phone) return <Tabs items={items} value={value} onValueChange={onValueChange} label={label} className={className} />;
  const options = items.map((item) => ({ value: item.value, label: item.text ?? (typeof item.label === 'string' ? item.label : item.value) }));
  return <Picker label={label} value={value} onChange={(next) => onValueChange(next as T)} placeholder="" groups={[{ options }]} />;
}
