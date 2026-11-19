import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SummaryView, SummaryWriting } from '@features/summary';

const follows = (a: HTMLElement, b: HTMLElement) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe('SummaryView', () => {
  it('reads overview, decisions, action items, key points, next steps — in that order', () => {
    render(<SummaryView summary="" structuredSummary={{
      overview: 'We planned the launch.',
      decisionsMade: ['Ship on the 14th'],
      actionItems: [{ id: 'a1', text: 'Send the brief', owner: 'Raj', completed: false }],
      keyDiscussionPoints: ['Pricing tiers'],
      nextSteps: ['Review next week'],
    }} />);
    const order = ['We planned the launch.', 'Decisions', 'Action items', 'Key points', 'Next steps'].map((t) => screen.getByText(t));
    order.slice(1).forEach((el, i) => expect(follows(order[i], el)).toBe(true));
    expect(screen.getByText('Raj')).toBeInTheDocument();
  });

  it('leaves out empty sections and never repeats the enhanced notes', () => {
    render(<SummaryView summary="" structuredSummary={{ overview: 'Short call.', keyDiscussionPoints: [], enhancedNotes: ['Launch: 14 Dec'] }} />);
    expect(screen.queryByText('Key points')).toBeNull();
    expect(screen.queryByText('Launch: 14 Dec')).toBeNull();
  });

  it('shows a placeholder while the summary is written', () => {
    render(<SummaryWriting label="Takes under a minute." />);
    expect(screen.getByRole('status')).toHaveTextContent('Takes under a minute.');
  });
});
