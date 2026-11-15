import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const setSettings = vi.fn();
let settings: Record<string, unknown> = {};

vi.mock('@shared/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings, setSettings }),
}));

import { useSpotlightControls } from '@features/integrations/hooks/useSpotlightControls';

describe('useSpotlightControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settings = {};
  });

  it('is a plain switch: ready, off until turned on', () => {
    const { result } = renderHook(() => useSpotlightControls());
    expect(result.current.access).toBe('ready');
    expect(result.current.enabled).toBe(false);
  });

  it('saves the switch', () => {
    const { result } = renderHook(() => useSpotlightControls());
    result.current.setEnabled(true);
    expect(setSettings).toHaveBeenCalledWith({ spotlightIntegration: { enabled: true } });
  });

  it('reads the saved setting', () => {
    settings = { spotlightIntegration: { enabled: true } };
    const { result } = renderHook(() => useSpotlightControls());
    expect(result.current.enabled).toBe(true);
  });
});
