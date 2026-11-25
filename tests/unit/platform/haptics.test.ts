/** Haptics play only on a device that has them, and Settings › General › Haptics silences them. */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const plugin = vi.hoisted(() => ({
  impactFeedback: vi.fn(() => Promise.resolve()),
  notificationFeedback: vi.fn(() => Promise.resolve()),
  selectionFeedback: vi.fn(() => Promise.resolve()),
}));
vi.mock('@tauri-apps/plugin-haptics', () => plugin);
const device = vi.hoisted(() => ({ platform: { hasHaptics: true } }));
vi.mock('@platform/index', () => device);

// eslint-disable-next-line import/first
import { haptic, setHapticsEnabled } from '@platform/haptics';

const played = () => plugin.impactFeedback.mock.calls.length + plugin.notificationFeedback.mock.calls.length + plugin.selectionFeedback.mock.calls.length;

describe('haptic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    device.platform.hasHaptics = true;
    setHapticsEnabled(true);
  });

  it('plays on an iPhone with Haptics on', () => {
    haptic('landed');
    expect(played()).toBe(1);
  });

  it('Haptics off in Settings silences every moment', () => {
    setHapticsEnabled(false);
    (['landed', 'failed', 'listening', 'pressed', 'select', 'warn'] as const).forEach(haptic);
    expect(played()).toBe(0);
  });

  it('a Mac plays nothing', () => {
    device.platform.hasHaptics = false;
    haptic('landed');
    expect(played()).toBe(0);
  });

  it('a feedback the system refuses is never an error for the caller', async () => {
    plugin.impactFeedback.mockReturnValueOnce(Promise.reject(new Error('no engine')));
    expect(() => haptic('landed')).not.toThrow();
    await Promise.resolve();
  });
});
