import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PartsList from '@features/chat/components/message/PartsList';
import type { ChatPart } from '@/types';

describe('PartsList', () => {
  const mockParts: ChatPart[] = [
    {
      type: 'text',
      text: 'Here is some information about the topic.',
    },
    {
      type: 'tool_call',
      toolCallId: 'call-1',
      toolName: 'search_meetings',
      arguments: { query: 'test' },
      status: 'complete',
      result: {
        content: 'Found results',
        isError: false,
        executionMs: 1000,
      },
    },
    {
      type: 'tool_call',
      toolCallId: 'call-2',
      toolName: 'search_meetings',
      arguments: { query: 'test2' },
      status: 'complete',
      result: {
        content: 'Found more results',
        isError: false,
        executionMs: 500,
      },
    },
  ];

  it('should render individual tool call blocks during streaming', () => {
    render(
      <PartsList 
        parts={mockParts} 
        messageId="test-msg" 
        streaming={true}
      />
    );
    
    // Should show text content
    expect(screen.getByText(/Here is some information about the topic/)).toBeInTheDocument();
    
    // Should show individual tool call blocks during streaming
    const toolBlocks = screen.getAllByText(/Searched meetings/);
    expect(toolBlocks.length).toBe(2); // Two individual blocks
  });

  it('should render tool call summary when not streaming', () => {
    render(
      <PartsList 
        parts={mockParts} 
        messageId="test-msg" 
        streaming={false}
      />
    );
    
    // Should show text content
    expect(screen.getByText(/Here is some information about the topic/)).toBeInTheDocument();
    
    // Should show single summary block when not streaming
    expect(screen.getByText(/Searched meetings ×2/)).toBeInTheDocument();
    expect(screen.getByText(/1.5s/)).toBeInTheDocument();
    
    // Should not show individual tool call blocks
    const allElements = screen.queryAllByText(/Searched meetings/);
    expect(allElements.length).toBe(1); // Only the summary
  });

  it('should handle mixed content types', () => {
    const mixedParts: ChatPart[] = [
      { type: 'text', text: 'Some text' },
      {
        type: 'tool_call',
        toolCallId: 'call-1',
        toolName: 'search_meetings',
        arguments: {},
        status: 'complete',
        result: { content: 'Result', isError: false, executionMs: 500 },
      },
      { type: 'text', text: 'More text' },
    ];
    
    render(
      <PartsList 
        parts={mixedParts} 
        messageId="test-msg" 
        streaming={false}
      />
    );
    
    // Should show both text parts
    expect(screen.getByText(/Some text/)).toBeInTheDocument();
    expect(screen.getByText(/More text/)).toBeInTheDocument();
    
    // Should show tool summary
    expect(screen.getByText(/Searched meetings/)).toBeInTheDocument();
  });
});
