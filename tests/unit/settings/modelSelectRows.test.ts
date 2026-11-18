import { describe, it, expect, vi } from 'vitest';
import { Mic } from 'lucide-react';
import { rowLabel } from '@features/settings/components/shared/ModelSelect';
import type { ModelChoice } from '@shared/utils/modelResolver';

const choice = (over: Partial<ModelChoice>): ModelChoice => ({
  value: 'v', provider: 'on-device', modelId: 'm', label: 'Whisper Small', ready: true, hint: null, ...over,
});
const setup = (over: Partial<NonNullable<ModelChoice['setup']>>) => ({ kind: 'download' as const, busy: false, percent: null, run: vi.fn(), ...over });

describe('Settings model menu rows (macOS menu wording)', () => {
  it('a ready model is its name, with its marks in parentheses', () => {
    expect(rowLabel(choice({}))).toBe('Whisper Small');
    expect(rowLabel(choice({ marks: [{ icon: Mic, label: 'Real-time' }] }))).toBe('Whisper Small (Real-time)');
  });

  it('a model to download reads as the action, with its size', () => {
    expect(rowLabel(choice({ ready: false, hint: '270 MB', setup: setup({}) }))).toBe('Download Whisper Small (270 MB)');
  });

  it('a download in progress shows its status after a dash', () => {
    expect(rowLabel(choice({ ready: false, setup: setup({ busy: true, percent: 42 }) }))).toBe('Whisper Small — Downloading 42%');
    expect(rowLabel(choice({ ready: false, setup: setup({ busy: true }) }))).toBe('Whisper Small — Downloading…');
  });

  it('a permission step and a missing key read naturally', () => {
    expect(rowLabel(choice({ label: 'Apple Speech', ready: false, setup: setup({ kind: 'allow' }) }))).toBe('Allow Apple Speech…');
    expect(rowLabel(choice({ label: 'GPT-5', ready: false, hint: 'Add OpenAI API key' }))).toBe('GPT-5 — Add OpenAI API key');
  });
});
