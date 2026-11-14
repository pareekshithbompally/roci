import { beforeEach, describe, expect, it } from 'vitest';
import { confirm, settleConfirm } from '@shared/stores/confirmStore';
import { createConsentGate } from '@shared/utils/consentGate';

const PROMPT = { title: 'Delete?', confirmLabel: 'Delete' };

describe('confirm()', () => {
  it('resolves with the answer', async () => {
    const yes = confirm(PROMPT);
    settleConfirm(true);
    await expect(yes).resolves.toBe(true);

    const no = confirm(PROMPT);
    settleConfirm(false);
    await expect(no).resolves.toBe(false);
  });

  it('a newer request supersedes an open one, which resolves false', async () => {
    const first = confirm(PROMPT);
    const second = confirm(PROMPT);
    await expect(first).resolves.toBe(false);
    settleConfirm(true);
    await expect(second).resolves.toBe(true);
  });

  it('settling with nothing open is a no-op', () => {
    expect(() => settleConfirm(true)).not.toThrow();
  });
});

describe('createConsentGate', () => {
  const KEY = 'test_consent';
  beforeEach(() => localStorage.removeItem(KEY));

  it('grants without prompting', async () => {
    const gate = createConsentGate(KEY, PROMPT);
    gate.grant();
    expect(gate.has()).toBe(true);
    await expect(gate.request()).resolves.toBe(true);
  });

  it('concurrent requests share one prompt and persist a yes', async () => {
    const gate = createConsentGate(KEY, PROMPT);
    const a = gate.request();
    const b = gate.request();
    settleConfirm(true);
    await expect(Promise.all([a, b])).resolves.toEqual([true, true]);
    expect(gate.has()).toBe(true);
  });

  it('a no is not persisted', async () => {
    const gate = createConsentGate(KEY, PROMPT);
    const answer = gate.request();
    settleConfirm(false);
    await expect(answer).resolves.toBe(false);
    expect(gate.has()).toBe(false);
  });
});
