/** Matched words are emphasised one by one, in any order — the same rule search matches by. */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HighlightedText } from '@shared/components/HighlightedText';

const emphasised = (container: HTMLElement) => [...container.querySelectorAll('[data-match]')].map((n) => n.textContent);

describe('HighlightedText', () => {
  it('emphasises every word of the query, wherever and in whatever order it appears', () => {
    const { container } = render(<HighlightedText text="Budget review with finance" highlight="review budget" emphasis="strong" />);
    expect(emphasised(container)).toEqual(['Budget', 'review']);
  });

  it('ignores case and treats regex characters as text', () => {
    const { container } = render(<HighlightedText text="Q1 (draft) plan" highlight="(DRAFT)" />);
    expect(emphasised(container)).toEqual(['(draft)']);
  });

  it('no query: the plain text', () => {
    const { container } = render(<HighlightedText text="Weekly sync" highlight="  " />);
    expect(container.textContent).toBe('Weekly sync');
    expect(emphasised(container)).toEqual([]);
  });
});

describe('MarkedExcerpt', () => {
  it('emphasises the words the search index marked, exactly as HighlightedText strong does', async () => {
    const { MarkedExcerpt } = await import('@shared/components/HighlightedText');
    const { container } = render(<MarkedExcerpt raw="we agreed the <<MARK>>pricing<</MARK>> for Q1" />);
    const match = container.querySelector('[data-match]');
    expect(match?.textContent).toBe('pricing');
    const { container: title } = render(<HighlightedText text="Pricing" highlight="pricing" emphasis="strong" />);
    expect(match?.className).toBe(title.querySelector('[data-match]')?.className);
  });
});
