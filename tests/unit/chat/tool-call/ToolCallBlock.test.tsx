import { describe, it, expect } from 'vitest';
import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { ToolCallBlock, type ToolCallPart } from '@features/chat/components/tool-call';

/** MCP blocks read server icons through TanStack Query. */
const render = (ui: ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

function part(overrides: Partial<ToolCallPart>): ToolCallPart {
  return {
    type: 'tool_call',
    toolCallId: 'call-1',
    toolName: 'get_chat',
    arguments: { session_id: 's1' },
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

  it('opens initially with defaultOpen', () => {
    render(<ToolCallBlock part={part({})} defaultOpen />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows the duration when complete and no failure badge', () => {
    render(<ToolCallBlock part={part({})} />);
    expect(screen.getByText('1.2s')).toBeInTheDocument();
    expect(screen.queryByText('Failed')).not.toBeInTheDocument();
  });

  it('shows the failure badge on error', () => {
    render(<ToolCallBlock part={part({ status: 'error', result: { content: 'boom', isError: true, executionMs: 5 } })} />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('get chat failed')).toBeInTheDocument();
    expect(screen.queryByText('5ms')).not.toBeInTheDocument();
  });

  it('shows a spinner and no duration while calling', () => {
    const { container } = render(<ToolCallBlock part={part({ status: 'calling', result: undefined })} />);
    expect(screen.getByText('Retrieving chat…')).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('titles MCP tools with their server', () => {
    render(<ToolCallBlock part={part({ toolName: 'create_issue', source: 'github' })} />);
    expect(screen.getByText('github · create issue')).toBeInTheDocument();
  });
});
