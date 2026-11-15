import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';

const setSettings = vi.fn();
const status = vi.fn();

vi.mock('@shared/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: {}, setSettings }),
}));
vi.mock('@services/spotlight.service', () => ({
  spotlightService: { status: () => status(), configure: vi.fn() },
}));

import { useSpotlightControls } from '@features/integrations/hooks/useSpotlightControls';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

describe('useSpotlightControls', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps an unsupported build to unavailable with its reason', async () => {
    status.mockResolvedValue({ supported: false });
    const { result } = renderHook(() => useSpotlightControls(), { wrapper });
    await waitFor(() => expect(result.current.access).toBe('unavailable'));
    expect(result.current.unavailableReason).toBe(INTEGRATIONS_CONFIG.spotlight.unavailable);
  });

  it('maps a supported build to ready and saves the switch', async () => {
    status.mockResolvedValue({ supported: true });
    const { result } = renderHook(() => useSpotlightControls(), { wrapper });
    await waitFor(() => expect(result.current.access).toBe('ready'));
    result.current.setEnabled(true);
    expect(setSettings).toHaveBeenCalledWith({ spotlightIntegration: { enabled: true } });
  });
});
