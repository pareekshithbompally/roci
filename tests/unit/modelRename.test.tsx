import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { getModelDisplayName } from '@shared/utils/provider.utils';
import { RenameModal } from '@shared/components/RenameModal';

describe('getModelDisplayName', () => {
  it('uses the rename, else the provider name, else the id', () => {
    expect(getModelDisplayName({ id: 'ggml-org/gemma-4-E4B-it-GGUF:Q4_0', displayName: 'Gemma' })).toBe('Gemma');
    expect(getModelDisplayName({ id: 'm', name: 'Model M' })).toBe('Model M');
    expect(getModelDisplayName({ id: 'm' })).toBe('m');
  });
});

describe('RenameModal', () => {
  const open = (props: Partial<React.ComponentProps<typeof RenameModal>>) => {
    const onConfirm = vi.fn();
    render(<RenameModal open onOpenChange={() => undefined} currentTitle="Gemma" onConfirm={onConfirm} {...props} />);
    return { onConfirm, input: screen.getByRole('textbox'), save: screen.getByRole('button', { name: 'Save' }) };
  };

  it('saves a new name', () => {
    const { onConfirm, input, save } = open({});
    fireEvent.change(input, { target: { value: 'Gemma 4' } });
    fireEvent.click(save);
    expect(onConfirm).toHaveBeenCalledWith('Gemma 4');
  });

  it('does not save an empty name unless clearable', () => {
    const plain = open({});
    fireEvent.change(plain.input, { target: { value: '' } });
    expect(plain.save).toBeDisabled();
  });

  it('clears the rename when clearable and emptied', () => {
    const { onConfirm, input, save } = open({ clearable: true, placeholder: 'ggml-org/gemma-4-E4B-it-GGUF:Q4_0' });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(save);
    expect(onConfirm).toHaveBeenCalledWith('');
  });
});
