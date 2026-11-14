/**
 * Settings auto-persist (save-on-edit) tests.
 *
 * Every mutation through SettingsContext must write through to disk after a
 * short debounce, with no explicit saveSettings() call — this is what replaced
 * the old dirty-tracking / save-footer machinery.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@services/db', () => ({
  store: {
    initialize: vi.fn(async () => {}),
    settings: {
      getAll: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
    },
    providers: {
      list: vi.fn(async () => []),
      upsert: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    },
  },
}));

vi.mock('@services/ai/transcription', () => ({
  defaultSpeechSelection: () => null,
}));

// eslint-disable-next-line import/first
import { store } from '@services/db';
// eslint-disable-next-line import/first
import { SettingsProvider, useSettings } from '@shared/contexts/SettingsContext';

const settingsSet = store.settings.set as unknown as ReturnType<typeof vi.fn>;
const providersList = store.providers.list as unknown as ReturnType<typeof vi.fn>;
const providersDelete = store.providers.delete as unknown as ReturnType<typeof vi.fn>;

function Probe() {
  const { setSettings, isLoading } = useSettings();
  return (
    <div>
      <span data-testid="loading">{isLoading ? 'loading' : 'ready'}</span>
      <button
        data-testid="edit"
        onClick={() => setSettings({ defaultAudioSource: 'microphone' as never })}
      >
        edit
      </button>
      <button
        data-testid="edit-again"
        onClick={() => setSettings({ defaultAudioSource: 'system' as never })}
      >
        edit-again
      </button>
    </div>
  );
}

function renderProvider() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    </QueryClientProvider>,
  );
}

async function renderReady() {
  const view = renderProvider();
  await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));
  settingsSet.mockClear();
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('settings save-on-edit', () => {
  it('persists a mutation after the debounce with no explicit save call', async () => {
    await renderReady();
    vi.useFakeTimers();

    fireEvent.click(screen.getByTestId('edit'));

    // Not written synchronously — debounced.
    expect(settingsSet).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    const calls = settingsSet.mock.calls.filter(([key]) => key === 'defaultAudioSource');
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toBe(JSON.stringify('microphone'));
  });

  it('coalesces rapid successive edits into a single write of the latest value', async () => {
    await renderReady();
    vi.useFakeTimers();

    fireEvent.click(screen.getByTestId('edit'));
    fireEvent.click(screen.getByTestId('edit-again'));

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    const calls = settingsSet.mock.calls.filter(([key]) => key === 'defaultAudioSource');
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toBe(JSON.stringify('system'));
  });

  it('flushes a pending edit on unmount so navigation never loses it', async () => {
    const view = await renderReady();
    vi.useFakeTimers();

    fireEvent.click(screen.getByTestId('edit'));

    await act(async () => {
      view.unmount();
    });

    const calls = settingsSet.mock.calls.filter(([key]) => key === 'defaultAudioSource');
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toBe(JSON.stringify('microphone'));
  });
});

describe('settings retired providers', () => {
  function ProbeProviders() {
    const { providers, selectedProviderName, isLoading } = useSettings();
    return (
      <div>
        <span data-testid="loading">{isLoading ? 'loading' : 'ready'}</span>
        <span data-testid="ids">{providers.map((p) => p.provider).join(',')}</span>
        <span data-testid="selected">{selectedProviderName ?? 'none'}</span>
      </div>
    );
  }

  function renderProviders() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={client}>
        <SettingsProvider>
          <ProbeProviders />
        </SettingsProvider>
      </QueryClientProvider>
    );
  }

  it('deletes retired providers from disk and drops dangling selections', async () => {
    providersList.mockResolvedValueOnce([
      { provider: 'xai', active: true, models: [], settings: [] },
      { provider: 'openai', active: true, models: [{ id: 'gpt-4o' }], settings: [] },
    ]);
    renderProviders();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));

    // Retired xai is deleted from disk and absent from the loaded list.
    expect(providersDelete).toHaveBeenCalledWith('xai');
    expect(providersDelete).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('ids').textContent).not.toContain('xai');
    expect(screen.getByTestId('ids').textContent).toContain('openai');
    // Dangling selection never points at a retired provider.
    expect(screen.getByTestId('selected').textContent).not.toBe('xai');
  });
});
