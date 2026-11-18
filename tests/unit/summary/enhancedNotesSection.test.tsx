import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EnhancedNotesSection, SummaryView } from '@features/summary';

describe('Your notes, enhanced', () => {
  it('leads the Overview when the summary has them', () => {
    render(<SummaryView summary="" structuredSummary={{ overview: 'We planned the launch.', enhancedNotes: ['Launch: aiming 14 Dec'] }} />);
    const heading = screen.getByText('Your notes, enhanced');
    expect(heading.compareDocumentPosition(screen.getByText('Overview')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Launch: aiming 14 Dec')).toBeInTheDocument();
  });

  it('shimmers the live notes while the final pass runs', () => {
    render(<EnhancedNotesSection items={['API (Raj): rate limits']} pending />);
    expect(screen.getByText('Finishing your notes…')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('API (Raj): rate limits');
  });

  it('shows nothing without notes', () => {
    const { container } = render(<EnhancedNotesSection items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
