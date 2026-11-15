import { describe, it, expect } from 'vitest';
import { findTextRange } from '@shared/utils/textRange';

function rendered(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('findTextRange', () => {
  it('finds spoken text across elements, whitespace and markup aside', () => {
    const root = rendered('<p>Run <code>npm_install</code> first.</p><p>Then   build.</p>');
    const match = findTextRange(root, 'Run npminstall first. Then build.', 0);
    expect(match?.range.toString()).toBe('Run npm_install first.Then   build.');
  });

  it('finds a repeated sentence in order, and nothing that is not there', () => {
    const root = rendered('<p>Yes. No. Yes.</p>');
    const first = findTextRange(root, 'Yes.', 0);
    const second = findTextRange(root, 'Yes.', first!.end);
    expect(second!.end).toBeGreaterThan(first!.end);
    expect(findTextRange(root, 'Maybe.', 0)).toBeNull();
  });
});
