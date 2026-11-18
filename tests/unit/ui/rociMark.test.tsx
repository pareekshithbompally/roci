import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Icon, RociMark } from '@shared/ui';

describe('RociMark', () => {
  it('renders the two filled wings at the icon size, like any glyph', () => {
    const { container } = render(<Icon icon={RociMark} size="md" />);
    const svg = container.querySelector('svg');
    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(2);
    paths.forEach((path) => expect(path.getAttribute('fill')).toBe('currentColor'));
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });
});
