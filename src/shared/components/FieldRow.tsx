/** A value typed into a settings row. Mac (System Settings): the field in the row. iPhone (Settings › Name): the row shows
 *  the value and opens its form (a pushed page, ✓ in its bar); `typed`: typed on the row itself (Wi-Fi › Other › Name). */

import React, { useState } from 'react';
import { Card, CardRow, Input, Textarea } from '@shared/ui';
import { KIT_COPY } from '@config/kitCopy.config';
import { LAYOUT } from '@config/layout.config';
import { useFormFactor } from '@platform/formFactor';
import { FormDialog } from './FormDialog';
import { SecretInput } from './SecretInput';

/** `secret`: a key or token, hidden. `url`: an address, typed as-is. `decimal`: a number, on the number pad. */
type FieldKind = 'text' | 'url' | 'secret' | 'decimal';

interface FieldRowProps {
  title: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  kind?: FieldKind;
  /** A long text (about you, instructions): this many lines in the Mac's field. Omitted: one line. */
  lines?: number;
  /** iPhone: typed on the row, inside a form that saves it. */
  typed?: boolean;
  /** Typed as-is: no capitals or corrections (a name a program reads). */
  literal?: boolean;
  autoFocus?: boolean;
  /** iPhone: how the row shows the value (an address with its keys hidden). */
  display?: (value: string) => string;
}

const INPUT_TYPE: Record<FieldKind, string> = { text: 'text', url: 'url', secret: 'password', decimal: 'text' };
const LITERAL = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } as const;

/** The one-line field's own attributes. */
const inputProps = ({ title, value, onChange, placeholder, maxLength, kind = 'text', literal, autoFocus }: FieldRowProps) => ({
  type: INPUT_TYPE[kind],
  ...(kind === 'decimal' && { inputMode: 'decimal' as const }),
  ...(literal && LITERAL),
  value,
  maxLength,
  placeholder,
  autoFocus,
  'aria-label': title,
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
});

/** Mac: the field itself, inline (one line) or under the title (a long text). */
const InlineField: React.FC<FieldRowProps> = (props) => {
  const { title, value, onChange, placeholder, maxLength, kind, lines } = props;
  if (lines) {
    return (
      <CardRow title={title} stacked>
        <Textarea rows={lines} value={value} maxLength={maxLength} placeholder={placeholder} autoFocus={props.autoFocus} aria-label={title} onChange={(e) => onChange(e.target.value)} />
      </CardRow>
    );
  }
  const field = kind === 'secret'
    ? <SecretInput value={value} placeholder={placeholder} label={title} onChange={onChange} />
    : <Input size="sm" {...inputProps(props)} />;
  return <CardRow title={title} actions={<div className={LAYOUT.settingsField}>{field}</div>} />;
};

/** iPhone, `typed`: the field on the row, its text at the row's end; a long text under its title, as many lines as it needs. */
const TypedRow: React.FC<FieldRowProps> = (props) => {
  const { title, value, onChange, placeholder, maxLength, lines, autoFocus } = props;
  if (!lines) return <CardRow title={title} actions={<Input variant="plain" size="sm" className="text-right" {...inputProps(props)} />} />;
  return (
    <CardRow title={title} stacked>
      <Textarea variant="bare" rows={lines} value={value} maxLength={maxLength} placeholder={placeholder} autoFocus={autoFocus} aria-label={title} onChange={(e) => onChange(e.target.value)} />
    </CardRow>
  );
};

/** What the iPhone row shows of the value: a secret as dots, a long text's first line. */
function shownValue({ value, kind, display }: FieldRowProps): string | undefined {
  if (!value) return undefined;
  if (kind === 'secret') return KIT_COPY.hidden;
  return display ? display(value) : value.split('\n')[0];
}

/** The plain field on its own page: as many lines as the text needs, or one. */
const PageField: React.FC<FieldRowProps> = (props) => {
  const { title, value, onChange, placeholder, maxLength, lines } = props;
  return lines ? (
    <Textarea variant="bare" autoFocus rows={lines * 2} value={value} maxLength={maxLength} placeholder={placeholder} aria-label={title} onChange={(e) => onChange(e.target.value)} className="py-3" />
  ) : (
    <Input variant="plain" {...inputProps(props)} autoFocus />
  );
};

/** iPhone: the value in a row that opens its form; ✓ saves through `onChange`, going back drops the edit. */
const EditRow: React.FC<FieldRowProps> = (props) => {
  const { title, value, onChange } = props;
  const [draft, setDraft] = useState<string | null>(null);
  const dirty = draft !== null && draft !== value;
  const save = () => {
    if (draft !== null) onChange(draft);
    setDraft(null);
  };
  return (
    <>
      <CardRow title={title} onOpen={() => setDraft(value)} value={shownValue(props)} valuePlaceholder={props.placeholder} />
      <FormDialog
        open={draft !== null}
        onOpenChange={(open) => !open && setDraft(null)}
        title={title}
        dirty={dirty}
        submit={{ label: KIT_COPY.save, onPress: save, disabled: !dirty }}
      >
        <Card><PageField {...props} value={draft ?? ''} onChange={setDraft} /></Card>
      </FormDialog>
    </>
  );
};

export const FieldRow: React.FC<FieldRowProps> = (props) => {
  const phone = useFormFactor() === 'phone';
  if (!phone) return <InlineField {...props} />;
  return props.typed ? <TypedRow {...props} /> : <EditRow {...props} />;
};
