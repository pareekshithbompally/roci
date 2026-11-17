import { useFormFactor } from '@platform/formFactor';
import { Tabs, type TabsProps } from './tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

export type ChoiceControlProps<T extends string> = Omit<TabsProps<T>, 'fill'> & {
  /** Accessible name (what it chooses: "Theme"); the menu form has no other. */
  label: string;
};

/** A setting with a few choices: a segmented control on Mac and iPad, a value menu on a phone (iOS). */
export function ChoiceControl<T extends string>({ items, value, onValueChange, label, className }: ChoiceControlProps<T>) {
  const phone = useFormFactor() === 'phone';
  if (!phone) return <Tabs items={items} value={value} onValueChange={onValueChange} label={label} className={className} />;
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as T)}>
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
