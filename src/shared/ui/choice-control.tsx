import { useFormFactor } from '@platform/formFactor';
import { Tabs, type TabsProps } from './tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

/** A setting with a few choices: a segmented control on Mac and iPad, a value menu on a phone (iOS). */
export function ChoiceControl<T extends string>({ items, value, onValueChange, className }: TabsProps<T>) {
  const phone = useFormFactor() === 'phone';
  if (!phone) return <Tabs items={items} value={value} onValueChange={onValueChange} className={className} />;
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as T)}>
      <SelectTrigger className={className}>
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
