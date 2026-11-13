import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { TEXT } from '@config/theme.config';
import { Button, Input } from '@shared/ui';

export type KeyValuePair = [key: string, value: string];

interface KeyValueEditorProps {
  label: string;
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
}

/** Editable key/value rows (env vars, HTTP headers). Always shows one row. */
export const KeyValueEditor: React.FC<KeyValueEditorProps> = ({
  label,
  pairs,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
}) => {
  const rows: KeyValuePair[] = pairs.length > 0 ? pairs : [['', '']];

  const update = (index: number, slot: 0 | 1, text: string) =>
    onChange(rows.map((pair, i) => (i === index ? (slot === 0 ? [text, pair[1]] : [pair[0], text]) : pair)));
  const remove = (index: number) => onChange(rows.filter((_, i) => i !== index));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.muted}`}>{label}</span>
        <Button variant="ghost" size="iconSm" onClick={() => onChange([...rows, ['', '']])} aria-label={`Add ${label.toLowerCase()}`}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      {rows.map(([key, value], index) => (
        <div key={index} className="flex items-center gap-2">
          <Input value={key} onChange={(e) => update(index, 0, e.target.value)} placeholder={keyPlaceholder} />
          <Input value={value} onChange={(e) => update(index, 1, e.target.value)} placeholder={valuePlaceholder} />
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

/** Drop blank keys and trim; the inverse of `Object.entries`. */
export function pairsToRecord(pairs: KeyValuePair[]): Record<string, string> {
  return Object.fromEntries(
    pairs.map(([k, v]) => [k.trim(), v.trim()] as const).filter(([k]) => k !== ''),
  );
}
