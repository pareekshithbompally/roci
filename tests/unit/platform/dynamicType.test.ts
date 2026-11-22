/** iPhone type follows the phone's Text Size through Apple's Dynamic Type table. */

import { describe, it, expect } from 'vitest';
import { contentSizeFor, typeTokensFor } from '@config/dynamicType.config';

describe('Text Size setting from Body', () => {
  it('names each standard setting by its Body size', () => {
    expect(contentSizeFor(14)).toBe('xSmall');
    expect(contentSizeFor(16)).toBe('medium');
    expect(contentSizeFor(17)).toBe('large');
    expect(contentSizeFor(23)).toBe('xxxLarge');
  });
  it('an accessibility size uses the largest standard one', () => {
    expect(contentSizeFor(28)).toBe('xxxLarge');
  });
});

describe("type tokens from Apple's table", () => {
  it('Medium (the third step): Body 16 / 21, Subhead 14 / 19, Footnote 12 / 16, with SF Pro tracking', () => {
    const t = typeTokensFor('medium');
    expect([t['--fs-body'], t['--lh-body'], t['--tr-body']]).toEqual(['16px', '21px', '-0.31px']);
    expect([t['--fs-reading'], t['--lh-reading']]).toEqual(['16px', '21px']);
    expect([t['--fs-callout'], t['--lh-callout'], t['--tr-callout']]).toEqual(['14px', '19px', '-0.15px']);
    expect([t['--fs-subheadline'], t['--lh-subheadline']]).toEqual(['12px', '16px']);
    expect([t['--fs-greeting'], t['--fs-title2']]).toEqual(['21px', '21px']);
  });
  it('Large (the default) matches the HIG default table', () => {
    const t = typeTokensFor('large');
    expect([t['--fs-body'], t['--lh-body'], t['--tr-body']]).toEqual(['17px', '22px', '-0.43px']);
    expect([t['--fs-large-title'], t['--lh-large-title']]).toEqual(['34px', '41px']);
  });
});
