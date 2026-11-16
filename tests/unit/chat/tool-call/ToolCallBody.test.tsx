import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  DefaultToolBody,
  MeetingResultsBody,
  ToolCallBody,
  parseMeetingResults,
  toolBodyFor,
} from '@features/chat/components/tool-call';
import type { ToolCallPart } from '@shared/types';

function part(overrides: Partial<ToolCallPart>): ToolCallPart {
  return {
    type: 'tool_call',
    toolCallId: 'call-1',
    toolName: 'search_meetings',
    arguments: { query: 'pricing' },
    status: 'complete',
    ...overrides,
  };
}

// Mirrors search-meetings.tool.ts output.
const SEARCH_RESULT = [
  'Found 2 relevant meeting(s):\n',
  '1. "Pricing review" (Jan 5, 2026)',
  '   Relevance: high | Match: "we agreed on tiered pricing..."',
  '   Meeting ID: m-1',
  '',
  '2. "Weekly sync" (Jan 2, 2026)',
  '   Relevance: low | Match: "pricing came up briefly..."',
  '   Meeting ID: m-2',
  '',
].join('\n');

// Mirrors list-meetings.tool.ts output.
const LIST_RESULT = [
  'Recent meetings (showing 2 of 9):\n',
  '1. "Pricing review" — Jan 5, 2026 — ID: m-1',
  '2. "Weekly sync" — Jan 2, 2026 — ID: m-2',
].join('\n');

describe('toolBodyFor (dispatcher)', () => {
  it('routes meeting search/list to MeetingResultsBody', () => {
    expect(toolBodyFor(part({ toolName: 'search_meetings' }))).toBe(MeetingResultsBody);
    expect(toolBodyFor(part({ toolName: 'list_meetings' }))).toBe(MeetingResultsBody);
  });

  it('routes everything else, and MCP tools, to DefaultToolBody', () => {
    expect(toolBodyFor(part({ toolName: 'get_meeting' }))).toBe(DefaultToolBody);
    expect(toolBodyFor(part({ toolName: 'unknown_tool' }))).toBe(DefaultToolBody);
    expect(toolBodyFor(part({ toolName: 'search_meetings', source: 'notion' }))).toBe(DefaultToolBody);
  });
});

describe('parseMeetingResults', () => {
  it('parses search_meetings rows with snippet and id', () => {
    expect(parseMeetingResults(SEARCH_RESULT)).toEqual([
      { title: 'Pricing review', date: 'Jan 5, 2026', snippet: 'we agreed on tiered pricing...', id: 'm-1' },
      { title: 'Weekly sync', date: 'Jan 2, 2026', snippet: 'pricing came up briefly...', id: 'm-2' },
    ]);
  });

  it('parses list_meetings rows', () => {
    expect(parseMeetingResults(LIST_RESULT)).toEqual([
      { title: 'Pricing review', date: 'Jan 5, 2026', id: 'm-1' },
      { title: 'Weekly sync', date: 'Jan 2, 2026', id: 'm-2' },
    ]);
  });

  it('returns no rows for free text', () => {
    expect(parseMeetingResults('No meetings found matching that query.')).toEqual([]);
  });
});

describe('ToolCallBody rendering', () => {
  it('renders meeting rows for search results', () => {
    render(<ToolCallBody part={part({ result: { content: SEARCH_RESULT, isError: false } })} />);
    expect(screen.getByText('Pricing review')).toBeInTheDocument();
    expect(screen.getByText('Jan 2, 2026')).toBeInTheDocument();
    expect(screen.getByText('we agreed on tiered pricing...')).toBeInTheDocument();
    expect(screen.queryByText('Input')).not.toBeInTheDocument();
  });

  it('falls back to Input/Output when the result does not parse', () => {
    const content = 'No meetings found matching that query.';
    render(<ToolCallBody part={part({ result: { content, isError: false } })} />);
    expect(screen.getByText('Input')).toBeInTheDocument();
    expect(screen.getByText('Output')).toBeInTheDocument();
    expect(screen.getByText(content)).toBeInTheDocument();
  });

  it('default body pretty-prints JSON arguments and output', () => {
    render(
      <ToolCallBody
        part={part({ toolName: 'get_chat', arguments: { session_id: 's1' }, result: { content: '{"a":1}', isError: false } })}
      />,
    );
    expect(screen.getByText(/"session_id": "s1"/)).toBeInTheDocument();
    expect(screen.getByText(/"a": 1/)).toBeInTheDocument();
  });

  it('default body omits Output while the call is running', () => {
    render(<ToolCallBody part={part({ toolName: 'get_chat', status: 'calling' })} />);
    expect(screen.getByText('Input')).toBeInTheDocument();
    expect(screen.queryByText('Output')).not.toBeInTheDocument();
  });
});
