import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import ToolCallSummary from '@features/chat/components/message/ToolCallSummary';
import type { ChatPart } from '@/types';

describe('ToolCallSummary', () => {
  const mockToolCalls: Extract<ChatPart, { type: 'tool_call' }>[] = [
    {
      type: 'tool_call',
      toolCallId: 'call-1',
      toolName: 'search_meetings',
      arguments: { query: 'housing crisis' },
      status: 'complete',
      result: {
        content: 'Found 3 meetings about housing crisis',
        isError: false,
        executionMs: 1200,
      },
    },
    {
      type: 'tool_call',
      toolCallId: 'call-2',
      toolName: 'search_meetings',
      arguments: { query: 'wall street' },
      status: 'complete',
      result: {
        content: 'Found 2 meetings about wall street',
        isError: false,
        executionMs: 800,
      },
    },
    {
      type: 'tool_call',
      toolCallId: 'call-3',
      toolName: 'retrieve_documents',
      arguments: { ids: ['doc1', 'doc2'] },
      status: 'complete',
      result: {
        content: 'Retrieved 2 documents',
        isError: false,
        executionMs: 1500,
      },
    },
  ];

  it('should render collapsed by default', () => {
    render(<ToolCallSummary parts={mockToolCalls} />);
    
    // Should show summary text (using regex to match parts)
    expect(screen.getByText(/Searched meetings ×2/)).toBeInTheDocument();
    expect(screen.getByText(/Used retrieve documents ×1/)).toBeInTheDocument();
    
    // Should show total time
    expect(screen.getByText('3.5s')).toBeInTheDocument();
    
    // Should not show details by default
    expect(screen.queryByText(/Found 3 meetings about housing crisis/)).not.toBeInTheDocument();
  });

  it('should show details when expanded', () => {
    render(<ToolCallSummary parts={mockToolCalls} />);
    
    // Click the button to expand
    const button = screen.getByRole('button');
    act(() => {
      button.click();
    });
    
    // Should show details
    expect(screen.getByText(/Found 3 meetings about housing crisis/)).toBeInTheDocument();
    expect(screen.getByText(/Found 2 meetings about wall street/)).toBeInTheDocument();
    expect(screen.getByText(/Retrieved 2 documents/)).toBeInTheDocument();
  });

  it('should handle single tool call', () => {
    const singleCall = [mockToolCalls[0]];
    render(<ToolCallSummary parts={singleCall} />);
    
    // Should show the tool name without count
    const span = screen.getByText(/Searched meetings/);
    expect(span).toBeInTheDocument();
    // For single calls, there should be no × symbol in the text
    expect(span.textContent).not.toContain('×');
  });

  it('should show error state', () => {
    const errorCalls = [
      {
        type: 'tool_call',
        toolCallId: 'call-error',
        toolName: 'search_meetings',
        arguments: { query: 'test' },
        status: 'error',
        result: {
          content: 'Search failed',
          isError: true,
          executionMs: 500,
        },
      },
    ];
    
    render(<ToolCallSummary parts={errorCalls} />);
    
    // Should show error icon and expand to see error details
    const button = screen.getByRole('button');
    act(() => {
      button.click();
    });
    expect(screen.getByText(/Search failed/)).toBeInTheDocument();
  });
});
