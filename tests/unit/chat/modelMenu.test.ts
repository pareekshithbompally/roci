import { describe, it, expect } from 'vitest';
import { modelMenu, rowFacts } from '@features/chat/components/ModelPicker';
import type { ModelChoice } from '@shared/utils/modelResolver';

const choice = (over: Partial<ModelChoice>): ModelChoice => ({
  value: 'm', provider: 'openai', modelId: 'm', label: 'gpt-5', ready: true, hint: null, info: null, ...over,
});

describe('Mac model menu', () => {
  it('a row\'s subtext is only short facts: what it takes in, what it can do, whether it is loaded', () => {
    const info = { modalities: { input: ['text', 'image'], output: ['text'] }, capabilities: { toolCall: true, reasoning: true } };
    expect(rowFacts(choice({ info }), false)).toBe('Vision · Tools · Thinking');
    expect(rowFacts(choice({}), true)).toBe('Loaded');
    expect(rowFacts(choice({}), false)).toBe('');
  });

  it('a header per provider; every model row has its icon, the chosen one is checked, setup rows are disabled at the end', () => {
    const entries = modelMenu(
      [['openai', [choice({ value: 'a', label: 'a' }), choice({ value: 'b', label: 'b' })]], ['gemini', [choice({ provider: 'gemini', value: 'c', label: 'c' })]]],
      [choice({ value: 'd', label: 'd', ready: false, hint: 'Add Groq API key' })],
      'b',
      () => false,
      (c) => `icon:${c.value}`,
    );
    expect(entries.map((e) => e.kind)).toEqual(['header', 'row', 'row', 'separator', 'header', 'row', 'separator', 'header', 'row']);
    expect(entries[0]).toEqual({ kind: 'header', title: 'OpenAI' });
    expect(entries[2]).toMatchObject({ kind: 'row', id: 'b', title: 'b', subtitle: '', icon: 'icon:b', checked: true, enabled: true });
    expect(entries.at(-1)).toMatchObject({ kind: 'row', title: 'd', subtitle: 'Add Groq API key', enabled: false });
  });
});
