import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OnDeviceModelsCard } from '@features/home/components/OnDeviceModelsCard';

const RAG_READY_KEY = 'rag_model_ready';
const VOICE_READY_KEY = 'voice_model_ready';
const DISMISSED_KEY = 'onboarding_models_dismissed';

beforeEach(() => {
  localStorage.removeItem(RAG_READY_KEY);
  localStorage.removeItem(VOICE_READY_KEY);
  localStorage.removeItem(DISMISSED_KEY);
});

describe('OnDeviceModelsCard', () => {
  it('names the models plainly with purpose and download links', () => {
    render(<OnDeviceModelsCard />);

    expect(screen.getByText('Meeting search')).toBeInTheDocument();
    expect(screen.getByText('Text to speech')).toBeInTheDocument();
    expect(screen.getByText('EmbeddingGemma 300M')).toBeInTheDocument();
    expect(screen.getByText('Kokoro 82M')).toBeInTheDocument();
    expect(screen.getByText('Models download live from Hugging Face')).toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument();
  });

  it('dismisses for good on Skip', () => {
    const { container, rerender } = render(<OnDeviceModelsCard />);
    expect(container).not.toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(localStorage.getItem(DISMISSED_KEY)).toBe('1');

    rerender(<OnDeviceModelsCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('stays hidden once dismissed, even on revisit', () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    const { container } = render(<OnDeviceModelsCard />);

    expect(container).toBeEmptyDOMElement();
  });

  it('stands down once both models are ready', () => {
    localStorage.setItem(RAG_READY_KEY, 'ready');
    localStorage.setItem(VOICE_READY_KEY, 'ready');
    const { container } = render(<OnDeviceModelsCard />);

    expect(container).toBeEmptyDOMElement();
  });
});
