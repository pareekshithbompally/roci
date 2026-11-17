import { describe, expect, it } from 'vitest';
import { confirm, settleConfirm } from '@shared/stores/confirmStore';

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
