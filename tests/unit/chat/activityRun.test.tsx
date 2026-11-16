import { describe, it, expect } from 'vitest';
import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
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
    const items = [thought, call('a', 1), call('b', 2)];
    const { rerender } = rtlRender(wrap(<ActivityRun items={items} settled={false} liveIndex={2} />));
    expect(screen.getAllByRole('button')).toHaveLength(3);
    rerender(wrap(<ActivityRun items={items} settled liveIndex={3} />));
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

  it('keeps live thinking folded with a shimmering label and the server stats joined by dots', () => {
    render(
      <ActivityRun
        items={[thought]}
        settled={false}
        liveIndex={0}
        generation={{ tokens: 214, elapsedMs: 12300, tokensPerSecond: 9.43 }}
      />,
    );
    const row = screen.getByRole('button', { name: new RegExp(CHAT_REASONING_COPY.thinking) });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(CHAT_REASONING_COPY.thinking)).toHaveClass('animate-text-shimmer');
    expect(screen.getByText('214 tokens · 12.3s · 9.4 tok/s')).toBeInTheDocument();
    expect(screen.queryByText('Let me check the meetings.')).not.toBeInTheDocument();
  });

  it('opens one running row in place, leaving the others folded, and keeps it open when it finishes', () => {
    const { rerender } = rtlRender(wrap(<ActivityRun items={[call('a', 0), call('b', 1, 'calling')]} settled={false} liveIndex={1} />));
    const [first, running] = screen.getAllByRole('button');
    fireEvent.click(running);
    expect(running).toHaveAttribute('aria-expanded', 'true');
    expect(first).toHaveAttribute('aria-expanded', 'false');
    rerender(wrap(<ActivityRun items={[call('a', 0), call('b', 1)]} settled={false} liveIndex={1} />));
    expect(running).toHaveAttribute('aria-expanded', 'true');
  });
});
