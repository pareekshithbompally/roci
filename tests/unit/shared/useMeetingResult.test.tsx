import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const detail = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@services/meeting.service', () => ({ meetingService: { getMeetingDetail: detail.get } }));

import { useMeetingResult } from '@shared/hooks/useMeetingResult';
import { queryKeys } from '@shared/query/queryKeys';

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

const stored = (title: string, text: string) => ({ index: { id: 'm1', title, categories: [] }, transcript: { text }, notes: [], todos: [] });

describe('useMeetingResult', () => {
  it('is loading (the view shows its loader) until the meeting is read from disk, nothing before', async () => {
    let finish: (value: unknown) => void = () => undefined;
    detail.get.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useMeetingResult('m1'), { wrapper });
    expect(result.current).toEqual({ loading: true, result: null });
    finish(stored('Weekly sync', 'hello'));
    await waitFor(() => expect(result.current).toMatchObject({ loading: false, result: { transcript: 'hello' } }));
  });

  it('reads the meeting again when the store announces a change (under the meetings key)', async () => {
    detail.get.mockResolvedValueOnce(stored('Weekly sync', 'draft')).mockResolvedValueOnce(stored('Weekly sync', 'final'));
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useMeetingResult('m1'), { wrapper });
    await waitFor(() => expect(result.current.result?.transcript).toBe('draft'));
    await client.invalidateQueries({ queryKey: queryKeys.meetings() });
    await waitFor(() => expect(result.current.result?.transcript).toBe('final'));
  });

  it('is nothing when no meeting is open', () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useMeetingResult(null), { wrapper });
    expect(result.current).toEqual({ loading: false, result: null });
  });
});
