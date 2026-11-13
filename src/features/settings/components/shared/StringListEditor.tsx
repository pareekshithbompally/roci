import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { TEXT } from '@config/theme.config';
import { Button, Input } from '@shared/ui';

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
        <span className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.muted}`}>{label}</span>
        <Button variant="ghost" size="iconSm" onClick={() => onChange([...rows, ''])} aria-label={`Add ${label.toLowerCase()}`}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      {rows.map((value, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input value={value} onChange={(e) => update(index, e.target.value)} placeholder={placeholder(index)} />
          {rows.length > 1 && (
            <Button variant="ghost" size="iconSm" onClick={() => remove(index)} aria-label="Remove">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
};
