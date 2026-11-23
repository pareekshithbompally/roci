/** The kit's device rules: what a Mac and a phone each get from one description (screens never check the device). */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UI_CONFIG } from '@config/ui.config';

const mocks = vi.hoisted(() => ({ formFactor: 'desktop' as 'desktop' | 'phone' }));
vi.mock('@platform/formFactor', () => ({ useFormFactor: () => mocks.formFactor }));

import { Tabs } from '@shared/ui/tabs';
import { CardRow, Card } from '@shared/ui/card';
import { commits } from '@shared/ui/touch-drag';
import { IconTile } from '@shared/ui/icon-tile';
import { Video } from 'lucide-react';
import { FieldRow } from '@shared/components/FieldRow';

const { commitSpeed, edgeShare } = UI_CONFIG.gesture;

describe('touch drag: a move completes past its share or on a flick, else springs back', () => {
  it('completes past the share of the travel', () => {
    expect(commits(300 * edgeShare + 1, 0, 300, edgeShare)).toBe(true);
  });
  it('completes on a flick even when short', () => {
    expect(commits(10, commitSpeed + 0.1, 300, edgeShare)).toBe(true);
  });
  it('springs back when short and slow', () => {
    expect(commits(10, commitSpeed / 2, 300, edgeShare)).toBe(false);
  });
});

const TABS = [
  { value: 'a', label: 'Live transcript', short: 'Transcript' },
  { value: 'b', label: 'Notes', only: 'phone' as const },
  { value: 'c', label: 'Related', only: 'desktop' as const },
];

describe('Tabs: one list, the items each form factor offers', () => {
  beforeEach(() => { mocks.formFactor = 'desktop'; });
  it('a Mac shows desktop items and full labels', () => {
    render(<Tabs items={TABS} value="a" onValueChange={() => undefined} />);
    expect(screen.getByRole('tab', { name: 'Live transcript' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Related' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Notes' })).toBeNull();
  });
  it('a phone shows phone items and short labels', () => {
    mocks.formFactor = 'phone';
    render(<Tabs items={TABS} value="a" onValueChange={() => undefined} />);
    expect(screen.getByRole('tab', { name: 'Transcript' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Notes' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Related' })).toBeNull();
  });
});

describe('CardRow: a row command is a button on a Mac, its own action row on a phone', () => {
  const action = { label: 'Clear Cache', onPress: vi.fn() };
  it('a Mac puts the command in the row as a button', () => {
    mocks.formFactor = 'desktop';
    const { container } = render(<Card><CardRow title="Cache" action={action} /></Card>);
    expect(container.querySelector('button')?.textContent).toBe('Clear Cache');
  });
  it('a phone gives the command its own row, no push button', () => {
    mocks.formFactor = 'phone';
    const { container } = render(<Card><CardRow title="Cache" action={action} /></Card>);
    expect(container.querySelector('button')).toBeNull();
    expect(screen.getByRole('button', { name: 'Clear Cache' })).toBeTruthy();
  });
  it('a phone row whose icon draws nothing keeps an empty, collapsing slot (no gap before the text)', () => {
    mocks.formFactor = 'phone';
    const { container } = render(<Card><CardRow title="Chat" leading={<IconTile icon={Video} />} /></Card>);
    const slot = container.querySelector('.empty\\:hidden');
    expect(slot).not.toBeNull();
    expect(slot?.childNodes.length).toBe(0);
  });
});

describe('FieldRow: typed in place on a Mac, a value row opening an edit sheet on a phone', () => {
  it('a Mac shows the field in the row', () => {
    mocks.formFactor = 'desktop';
    render(<Card><FieldRow title="Name" value="Pari" onChange={() => undefined} /></Card>);
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeTruthy();
  });
  it('a phone shows the value with no field until the row is opened', () => {
    mocks.formFactor = 'phone';
    render(<Card><FieldRow title="Name" value="Pari" onChange={() => undefined} /></Card>);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Pari')).toBeTruthy();
  });
});
