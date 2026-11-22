import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Viewer } from '@shared/ui';

const image = { kind: 'image' as const, src: 'asset://x.png', alt: 'A ballroom' };

describe('Viewer', () => {
  it('renders over the whole window, outside the panel that opened it', () => {
    const { container } = render(<div data-testid="panel"><Viewer media={image} open onOpenChange={() => {}} /></div>);
    const dialog = screen.getByRole('dialog', { name: 'A ballroom' });
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it('closes on Escape and on a click outside the image, not on the image', () => {
    const onOpenChange = vi.fn();
    render(<Viewer media={image} open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('img', { name: 'A ballroom' }));
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });

  it('shows a PDF in a frame named for it', () => {
    render(<Viewer media={{ kind: 'pdf', src: 'blob:pdf', title: 'Q3 report.pdf' }} open onOpenChange={() => {}} />);
    expect(screen.getByTitle('Q3 report.pdf')).toHaveAttribute('src', 'blob:pdf');
  });
});
