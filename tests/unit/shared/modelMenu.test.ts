import { describe, it, expect, vi } from 'vitest';
import { Mic } from 'lucide-react';

vi.mock('@services/tauri', async (importOriginal) => ({ ...(await importOriginal<typeof import('@services/tauri')>()), nativeMenu: vi.fn() }));

import { modelMenuEntries, modelRowText, modelSubtitle } from '@shared/components/modelMenu';
import type { ModelChoice } from '@shared/utils/modelResolver';
import type { ModelProfile } from '@services/ai/models/profile';

const choice = (over: Partial<ModelChoice>): ModelChoice => ({
  value: 'v', provider: 'on-device', modelId: 'm', label: 'Whisper Small', ready: true, hint: null, ...over,
});
const setup = (over: Partial<NonNullable<ModelChoice['setup']>>) => ({ kind: 'download' as const, busy: false, percent: null, run: vi.fn(), ...over });

describe('the one model menu (chat and Settings)', () => {
  it('the grey line: what a model takes in and can do, its marks, whether it is loaded', () => {
    const profile: ModelProfile = {
      input: ['text', 'image'], output: ['text'], tools: true, reasoning: true, contextTokens: null, known: true, correctedInputs: [],
      sourceOf: { input: 'provider', output: 'provider', tools: 'provider', reasoning: 'provider', contextTokens: 'provider' },
    };
    expect(modelSubtitle(choice({ profile }))).toBe('Vision · Tools · Thinking');
    expect(modelSubtitle(choice({ marks: [{ icon: Mic, label: 'Real-time' }] }))).toBe('Real-time');
    expect(modelSubtitle(choice({}), true)).toBe('Loaded');
    expect(modelSubtitle(choice({}))).toBe('');
  });

  it('a model that needs a step says the step or where it stands; one that cannot run says why', () => {
    expect(modelSubtitle(choice({ ready: false, hint: '751.1 MB', setup: setup({}) }))).toBe('Download · 751.1 MB');
    expect(modelSubtitle(choice({ ready: false, setup: setup({ busy: true, percent: 42 }) }))).toBe('Downloading 42%');
    expect(modelSubtitle(choice({ ready: false, setup: setup({ kind: 'allow' }) }))).toBe('Allow access');
    expect(modelSubtitle(choice({ ready: false, hint: 'Add Groq API key' }))).toBe('Add Groq API key');
  });

  it('a text-only menu shows the same row as one line', () => {
    expect(modelRowText(choice({ ready: false, hint: '751.1 MB', setup: setup({}) }))).toBe('Whisper Small — Download · 751.1 MB');
    expect(modelRowText(choice({}))).toBe('Whisper Small');
  });

  it('native entries: Off first, a header per provider, setup rows last and still pickable, the chosen one checked', () => {
    const entries = modelMenuEntries(
      [choice({ value: 'a', label: 'a', provider: 'openai' }), choice({ value: 'b', label: 'b', ready: false, hint: '1 GB', setup: setup({}) }), choice({ value: 'c', label: 'c', ready: false, hint: 'Add key' })],
      { selected: 'a', off: { value: 'off', label: 'Off' } },
      (c) => `icon:${c.value}`,
    );
    expect(entries.map((e) => e.kind)).toEqual(['row', 'separator', 'header', 'row', 'separator', 'header', 'row', 'row']);
    expect(entries[3]).toMatchObject({ id: 'a', checked: true, enabled: true, icon: 'icon:a' });
    expect(entries[6]).toMatchObject({ id: 'b', subtitle: 'Download · 1 GB', enabled: true });
    expect(entries[7]).toMatchObject({ id: 'c', subtitle: 'Add key', enabled: false });
  });
});
