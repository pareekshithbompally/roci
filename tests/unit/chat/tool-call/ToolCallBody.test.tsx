import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  DefaultToolBody,
  MeetingResultsBody,
  ToolCallBody,
  toolBodyFor,
} from '@features/chat/components/tool-call';
import type { ToolCallView } from '@features/chat/components/tool-call';

function part(overrides: Partial<ToolCallView>): ToolCallView {
  return {
    type: 'tool_call',
    toolCallId: 'call-1',
    toolName: 'find',
    arguments: { in: 'meetings', query: 'pricing' },
    status: 'complete',
    ...overrides,
  };
}

// The meetings find.tool.ts attaches to a meeting search.
const MEETINGS = [
  { id: 'm-1', title: 'Pricing review', date: 'Jan 5, 2026', snippet: 'we agreed on tiered pricing' },
  { id: 'm-2', title: 'Weekly sync', date: 'Jan 2, 2026' },
];

describe('toolBodyFor (dispatcher)', () => {
  it('lists meetings when the call returned some', () => {
    expect(toolBodyFor(part({ meetings: MEETINGS }))).toBe(MeetingResultsBody);
  });

  it('shows Output and Parameters for everything else, MCP tools included', () => {
    expect(toolBodyFor(part({}))).toBe(DefaultToolBody);
    expect(toolBodyFor(part({ meetings: [] }))).toBe(DefaultToolBody);
    expect(toolBodyFor(part({ toolName: 'read', arguments: { meeting_id: 'm-1' } }))).toBe(DefaultToolBody);
    expect(toolBodyFor(part({ source: 'notion' }))).toBe(DefaultToolBody);
  });
});

describe('ToolCallBody rendering', () => {
  it('renders meeting rows for search results', () => {
    render(<ToolCallBody part={part({ result: { content: 'Found 2', isError: false }, meetings: MEETINGS })} />);
    expect(screen.getByText('Pricing review')).toBeInTheDocument();
    expect(screen.getByText('Jan 2, 2026')).toBeInTheDocument();
    expect(screen.getByText('we agreed on tiered pricing')).toBeInTheDocument();
    expect(screen.getByText('Parameters')).toBeInTheDocument();
    expect(screen.queryByText('Output')).not.toBeInTheDocument();
  });

  it('shows Output and Parameters when no meetings came back', () => {
    const content = 'No meetings found matching that query.';
    render(<ToolCallBody part={part({ result: { content, isError: false } })} />);
    expect(screen.getByText('Parameters')).toBeInTheDocument();
    expect(screen.getByText('Output')).toBeInTheDocument();
    expect(screen.getByText(content)).toBeInTheDocument();
  });

  it('default body shows the arguments as parameters and pretty-prints JSON output', () => {
    render(
      <ToolCallBody
        part={part({ toolName: 'read', arguments: { chat_id: 's1' }, result: { content: '{"a":1}', isError: false } })}
      />,
    );
    expect(screen.getByText('chat_id')).toBeInTheDocument();
    expect(screen.getByText('s1')).toBeInTheDocument();
    expect(screen.getByText(/"a": 1/)).toBeInTheDocument();
  });

  it('default body omits Output while the call is running', () => {
    render(<ToolCallBody part={part({ toolName: 'read', arguments: { chat_id: 's1' }, status: 'calling' })} />);
    expect(screen.getByText('Parameters')).toBeInTheDocument();
    expect(screen.queryByText('Output')).not.toBeInTheDocument();
  });
});
