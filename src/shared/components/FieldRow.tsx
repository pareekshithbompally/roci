/** A value typed into a settings row. Mac (System Settings): the field in the row. iPhone (Settings › Name): the row shows
 *  the value and opens an edit sheet — ✕ / ✓ in its bar, the field plain in its own card. */

import React, { useState } from 'react';
import { Card, CardRow, EditSheet, Input, Text, Textarea } from '@shared/ui';
import { LAYOUT } from '@config/layout.config';
import { useFormFactor } from '@platform/formFactor';
import { SecretInput } from './SecretInput';

/** `secret`: a key or token, hidden. `url`: an address, typed as-is. */
type FieldKind = 'text' | 'url' | 'secret';

interface FieldRowProps {
  title: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  kind?: FieldKind;
  /** A long text (about you, instructions): this many lines in the Mac's field. Omitted: one line. */
  lines?: number;
}

/** Mac: the field itself, inline (one line) or under the title (a long text). */
const InlineField: React.FC<FieldRowProps> = ({ title, value, onChange, placeholder, maxLength, kind = 'text', lines }) => {
  if (lines) {
    return (
      <CardRow title={title} stacked>
        <Textarea rows={lines} value={value} maxLength={maxLength} placeholder={placeholder} aria-label={title} onChange={(e) => onChange(e.target.value)} />
      </CardRow>
    );
  }
  const field = kind === 'secret'
    ? <SecretInput value={value} placeholder={placeholder} label={title} onChange={onChange} />
    : <Input size="sm" type={kind === 'url' ? 'url' : 'text'} value={value} maxLength={maxLength} placeholder={placeholder} aria-label={title} onChange={(e) => onChange(e.target.value)} />;
  return <CardRow title={title} actions={<div className={LAYOUT.settingsField}>{field}</div>} />;
};

/** What the iPhone row shows: the value (a secret as dots, a long text's first line), else the placeholder. */
function shownValue({ value, placeholder, kind }: FieldRowProps): string {
  if (!value) return placeholder ?? '';
  return kind === 'secret' ? '••••••••' : value.split('\n')[0];
}

/** The plain field inside the edit sheet: as many lines as the text needs, or one. */
const SheetField: React.FC<FieldRowProps & { draft: string; setDraft: (v: string) => void }> = ({ title, placeholder, maxLength, kind = 'text', lines, draft, setDraft }) =>
  lines ? (
    <Textarea variant="bare" autoFocus rows={lines * 2} value={draft} maxLength={maxLength} placeholder={placeholder} aria-label={title} onChange={(e) => setDraft(e.target.value)} className="py-3" />
  ) : (
    <Input variant="plain" autoFocus type={kind === 'secret' ? 'password' : kind === 'url' ? 'url' : 'text'} value={draft} maxLength={maxLength} placeholder={placeholder} aria-label={title} onChange={(e) => setDraft(e.target.value)} />
  );

/** iPhone: the value in a row that opens the edit sheet; ✓ saves through `onChange`, ✕ drops the edit. */
const EditRow: React.FC<FieldRowProps> = (props) => {
  const { title, value, onChange } = props;
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    if (draft !== null) onChange(draft);
    setDraft(null);
  };
  return (
    <>
      <CardRow title={title} onOpen={() => setDraft(value)} actions={<Text tone={value ? 'muted' : 'faint'} truncate>{shownValue(props)}</Text>} />
      <EditSheet open={draft !== null} onOpenChange={(open) => !open && setDraft(null)} title={title} canSave={draft !== null && draft !== value} onSave={save}>
        <Card><SheetField {...props} draft={draft ?? ''} setDraft={setDraft} /></Card>
      </EditSheet>
    </>
  );
};

export const FieldRow: React.FC<FieldRowProps> = (props) =>
  useFormFactor() === 'phone' ? <EditRow {...props} /> : <InlineField {...props} />;
