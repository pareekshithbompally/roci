import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPopover } from '@shared/ui/command-popover';

const props = {
  searchPlaceholder: 'Search',
  emptyText: 'Nothing',
};

describe('CommandPopover', () => {
  it('trigger mode toggles through the trigger button', () => {
    const onOpenChange = vi.fn();
    render(
      <CommandPopover
        {...props}
        open={false}
        onOpenChange={onOpenChange}
        trigger={<button type="button">open tools</button>}
      >
        <div>panel body</div>
      </CommandPopover>
    );

    expect(screen.queryByText('panel body')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'open tools' }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});
