import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { IconButton, Input, Text } from '@shared/ui';

interface StringListEditorProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  /** Placeholder for row `index` (0-based). */
  placeholder: (index: number) => string;
}

/** Editable ordered list of strings (e.g. command arguments). Always shows one row. */
export const StringListEditor: React.FC<StringListEditorProps> = ({ label, values, onChange, placeholder }) => {
  const rows = values.length > 0 ? values : [''];

  const update = (index: number, value: string) => onChange(rows.map((v, i) => (i === index ? value : v)));
  const remove = (index: number) => onChange(rows.filter((_, i) => i !== index));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Text variant="bodyStrong" tone="muted">{label}</Text>
        <IconButton icon={Plus} size="sm" label={`Add ${label.toLowerCase()}`} onClick={() => onChange([...rows, ''])} />
      </div>
      {rows.map((value, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input value={value} onChange={(e) => update(index, e.target.value)} placeholder={placeholder(index)} />
          {rows.length > 1 && <IconButton icon={Trash2} size="sm" variant="dangerGhost" label="Remove" onClick={() => remove(index)} />}
        </div>
      ))}
    </div>
  );
};
