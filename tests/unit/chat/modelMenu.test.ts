import { describe, it, expect, vi } from 'vitest';
import { modelMenuEntries, rowText } from '@features/chat/components/ModelPicker';
import type { ModelChoice } from '@shared/utils/modelResolver';

const choice = (over: Partial<ModelChoice>): ModelChoice => ({
  value: 'm', provider: 'openai', modelId: 'm', label: 'gpt-5', ready: true, hint: null, info: null, ...over,
});

describe('Mac model menu', () => {
  it('a row is the name and only short facts: what it takes in, what it can do, whether it is loaded', () => {
    const info = { modalities: { input: ['text', 'image'], output: ['text'] }, capabilities: { toolCall: true, reasoning: true } };
    expect(rowText(choice({ info }), false)).toBe('gpt-5 · Vision · Tools · Thinking');
    expect(rowText(choice({}), true)).toBe('gpt-5 · Loaded');
    expect(rowText(choice({}), false)).toBe('gpt-5');
  });

  it('each provider gets a logo header, the chosen model is checked, and setup rows are disabled at the end', () => {
    const pick = vi.fn();
    const entries = modelMenuEntries(
      [['openai', [choice({ value: 'a', label: 'a' }), choice({ value: 'b', label: 'b' })]], ['gemini', [choice({ provider: 'gemini', value: 'c', label: 'c' })]]],
      [choice({ value: 'd', label: 'd', ready: false, hint: 'Add Groq API key' })],
      'b',
      pick,
      () => false,
    );
    expect(entries.map((e) => e.type)).toEqual(['label', 'check', 'check', 'separator', 'label', 'check', 'separator', 'label', 'item']);
    expect(entries[0]).toMatchObject({ label: 'OpenAI' });
    expect(entries.filter((e) => e.type === 'check' && e.checked).map((e) => e.type === 'check' && e.label)).toEqual(['b']);
    expect(entries.at(-1)).toMatchObject({ label: 'd — Add Groq API key', disabled: true });
    const first = entries[1];
    if (first.type === 'check') first.onSelect();
    expect(pick).toHaveBeenCalledWith('a');
  });
});
