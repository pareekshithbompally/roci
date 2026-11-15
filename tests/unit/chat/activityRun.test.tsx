import { describe, it, expect, vi, afterEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { CHAT_ACTIVITY_COPY, CHAT_REASONING_COPY } from '@config/chat.config';
import { ActivityRun } from '@features/chat/components/message/ActivityRun';
import type { ActivityPart, IndexedPart } from '@features/chat/components/message/groupActivity';

/** Tool rows read MCP server icons through TanStack Query. */
const wrap = (ui: ReactElement) => <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
const render = (ui: ReactElement) => rtlRender(wrap(ui));

const thought: IndexedPart<ActivityPart> = { part: { type: 'reasoning', text: 'Let me check the meetings.' }, index: 0 };
const call = (id: string, index: number, status: 'calling' | 'complete' = 'complete'): IndexedPart<ActivityPart> => ({
  part: { type: 'tool_call', toolCallId: id, toolName: 'get_chat', arguments: {}, status, result: status === 'complete' ? { content: 'ok', isError: false, executionMs: 500 } : undefined },
  index,
});

describe('ActivityRun', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('shows each thinking block and tool call as its own row while the model works', () => {
    render(<ActivityRun items={[thought, call('a', 1), call('b', 2, 'calling')]} settled={false} liveIndex={2} />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.queryByText(CHAT_ACTIVITY_COPY.tools(2), { exact: false })).not.toBeInTheDocument();
  });

  it('folds the run into one combined row once the answer follows it', () => {
    render(<ActivityRun items={[thought, call('a', 1), call('b', 2)]} settled liveIndex={null} />);
    const row = screen.getByRole('button', { name: new RegExp(`${CHAT_ACTIVITY_COPY.thought} · ${CHAT_ACTIVITY_COPY.tools(2)}`) });
    expect(row).toHaveTextContent('1.0s');
    expect(row).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(row);
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('folds the same run in place the moment the answer starts, keeping its rows', () => {
    vi.useFakeTimers();
    const items = [thought, call('a', 1), call('b', 2)];
    const { rerender } = rtlRender(wrap(<ActivityRun items={items} settled={false} liveIndex={2} />));
    expect(screen.getAllByRole('button')).toHaveLength(3);
    rerender(wrap(<ActivityRun items={items} settled liveIndex={3} />));
    act(() => { vi.runOnlyPendingTimers(); });
    const run = screen.getByRole('button', { name: new RegExp(CHAT_ACTIVITY_COPY.tools(2)) });
    expect(run).toHaveAttribute('aria-expanded', 'false');
  });

  it('folds a lone row in place once the answer follows, with no combined row around it', () => {
    render(<ActivityRun items={[thought]} settled liveIndex={null} />);
    const row = screen.getByRole('button', { name: new RegExp(CHAT_REASONING_COPY.done) });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText(CHAT_ACTIVITY_COPY.thought)).not.toBeInTheDocument();
  });

  it('shows live thinking open with the server stats joined by dots', () => {
    render(
      <ActivityRun
        items={[thought]}
        settled={false}
        liveIndex={0}
        generation={{ tokens: 214, elapsedMs: 12300, tokensPerSecond: 9.43 }}
      />,
    );
    expect(screen.getByRole('button', { name: new RegExp(CHAT_REASONING_COPY.thinking) })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('214 tokens · 12.3s · 9.4 tok/s')).toBeInTheDocument();
    expect(screen.getByText('Let me check the meetings.')).toBeInTheDocument();
  });

  it('keeps a row the user closed by hand closed, even while it runs', () => {
    vi.useFakeTimers();
    const { rerender } = rtlRender(wrap(<ActivityRun items={[call('a', 0, 'calling')]} settled={false} liveIndex={0} />));
    const row = screen.getByRole('button');
    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'false');
    rerender(wrap(<ActivityRun items={[call('a', 0)]} settled={false} liveIndex={0} />));
    act(() => { vi.advanceTimersByTime(ANIMATION_CONFIG.chat.activityFoldDelayMs); });
    expect(row).toHaveAttribute('aria-expanded', 'false');
  });
});
