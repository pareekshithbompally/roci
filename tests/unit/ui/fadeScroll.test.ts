/** Which edges of a scroller fade: only an edge with content beyond it, so nothing at rest is ever faded or cut. */

import { describe, it, expect } from 'vitest';
import { fadingEdges } from '@shared/ui/fade-scroll';

describe('fadingEdges', () => {
  it('content that fits: no fade at all', () => {
    expect(fadingEdges({ scrollTop: 0, scrollHeight: 300, clientHeight: 400 })).toEqual({ top: false, bottom: false });
  });

  it('at the top of a long list: only the bottom fades', () => {
    expect(fadingEdges({ scrollTop: 0, scrollHeight: 1000, clientHeight: 400 })).toEqual({ top: false, bottom: true });
  });

  it('scrolled into the middle: both edges fade', () => {
    expect(fadingEdges({ scrollTop: 200, scrollHeight: 1000, clientHeight: 400 })).toEqual({ top: true, bottom: true });
  });

  it('at the end: only the top fades (sub-pixel rounding counts as the end)', () => {
    expect(fadingEdges({ scrollTop: 599.5, scrollHeight: 1000, clientHeight: 400 })).toEqual({ top: true, bottom: false });
  });
});
