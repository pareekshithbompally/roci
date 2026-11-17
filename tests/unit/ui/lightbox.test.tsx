import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Lightbox } from '@shared/ui';

describe('Lightbox', () => {
  it('renders over the whole window, outside the panel that opened it', () => {
    const { container } = render(<div data-testid="panel"><Lightbox src="asset://x.png" alt="A ballroom" open onOpenChange={() => {}} /></div>);
    const dialog = screen.getByRole('dialog', { name: 'A ballroom' });
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it('closes on Escape and on a click outside the image, not on the image', () => {
    const onOpenChange = vi.fn();
    render(<Lightbox src="asset://x.png" alt="A ballroom" open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('img', { name: 'A ballroom' }));
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });
});
