import { describe, it, expect } from 'vitest';
import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import type { ToolCallView } from '@features/chat/components/tool-call';
import { ToolCallBlock } from '@features/chat/components/tool-call';
import { ThemeProvider } from '@shared/contexts/ThemeContext';

/** MCP blocks read server icons through TanStack Query, picked for the current theme. */
const render = (ui: ReactElement) =>
  rtlRender(<ThemeProvider><QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider></ThemeProvider>);

function part(overrides: Partial<ToolCallView>): ToolCallView {
  return {
    type: 'tool_call',
    toolCallId: 'call-1',
    toolName: 'read',
    arguments: { chat_id: 's1' },
    status: 'complete',
    result: { content: 'chat body', isError: false, executionMs: 1200 },
    ...overrides,
  };
}

describe('ToolCallBlock', () => {
  it('is collapsed by default and toggles its body', () => {
    render(<ToolCallBlock part={part({})} />);
    const header = screen.getByRole('button', { name: /Retrieved chat/ });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('chat body')).not.toBeInTheDocument();

    fireEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('chat body')).toBeInTheDocument();
  });

  it('stays folded while running and after, unless the user opens it', () => {
    const wrap = (ui: ReactElement) => <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
    const { rerender } = rtlRender(wrap(<ToolCallBlock part={part({ status: 'calling', result: undefined })} />));
    const header = screen.getByRole('button');
    expect(header).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(header);
    rerender(wrap(<ToolCallBlock part={part({})} />));
    expect(header).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows the duration when complete and no failure badge', () => {
    render(<ToolCallBlock part={part({})} />);
    expect(screen.getByText('1.2s')).toBeInTheDocument();
    expect(screen.queryByText('Failed')).not.toBeInTheDocument();
  });

  it('shows the failure badge on error', () => {
    render(<ToolCallBlock part={part({ status: 'error', result: { content: 'boom', isError: true, executionMs: 5 } })} />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Retrieving chat failed')).toBeInTheDocument();
    expect(screen.queryByText('5ms')).not.toBeInTheDocument();
  });

  it('shimmers its title and shows no duration while calling', () => {
    render(<ToolCallBlock part={part({ status: 'calling', result: undefined })} />);
    expect(screen.getByText('Retrieving chat…')).toHaveClass('animate-text-shimmer');
    expect(screen.queryByText('1.2s')).not.toBeInTheDocument();
  });

  it('titles MCP tools with their server', () => {
    render(<ToolCallBlock part={part({ toolName: 'create_issue', source: 'github' })} />);
    expect(screen.getByText('github · create issue')).toBeInTheDocument();
  });
});
