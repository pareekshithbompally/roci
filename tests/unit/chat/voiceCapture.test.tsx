import { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { ChatInput } from '@features/chat/components/ChatInput';
import type { SpeechState } from '@features/chat/hooks/useSpeechInput';

/** ChatInput reads server state (model picker, tools) through TanStack Query. */
const render = (ui: ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

/** Canvas DotScope is irrelevant to capture-state wiring — stub it. */
vi.mock('@features/chat/components/dot-scope', () => ({
  DotScope: (props: { stage: string; label: string }) => (
    <div data-testid="dotscope" data-stage={props.stage} aria-label={props.label} />
  ),
}));

/** Pickers need Settings/Tauri providers, so stub them to keep the test on the pill/composer swap. */
vi.mock('@features/chat/components/tools/ToolsPicker', () => ({
  ToolsPicker: () => null,
}));
vi.mock('@features/chat/components/ModelPicker', () => ({
  ModelPicker: () => null,
}));

const baseProps = {
  value: '',
  onChange: vi.fn(),
  onSend: vi.fn(),
  showSpeechInput: true,
  micStream: null,
  speechElapsed: 5,
  onSpeechStart: vi.fn(),
  onSpeechStop: vi.fn(),
  onSpeechTogglePause: vi.fn(),
  onSpeechCancel: vi.fn(),
};

function renderInput(speechState: SpeechState) {
  return render(<ChatInput {...baseProps} speechState={speechState} />);
}

describe('ChatInput voice capture', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('idle: shows the composer box, hides the pill', () => {
    renderInput('idle');

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByTitle('Voice input')).toBeInTheDocument();
    expect(screen.queryByTestId('dotscope')).not.toBeInTheDocument();
  });

  it('recording: pill is the sole focus, Stop + Pause below it', () => {
    renderInput('recording');

    // The composer box stays mounted but inert: out of the a11y tree, pointer events off.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    const box = screen.getByTestId('composer-box');
    expect(box).toHaveAttribute('aria-hidden', 'true');
    expect(box).toHaveAttribute('inert');

    const pill = screen.getByTestId('dotscope');
    expect(pill).toHaveAttribute('data-stage', 'recording');
    expect(screen.getByTitle('Stop recording')).toBeInTheDocument();
    expect(screen.getByTitle('Pause recording')).toBeInTheDocument();
    expect(screen.getByText('00:05')).toBeInTheDocument();
  });

  it('paused: pill holds, Resume + Stop below it', () => {
    renderInput('paused');

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    const pill = screen.getByTestId('dotscope');
    expect(pill).toHaveAttribute('aria-label', 'Paused');
    expect(screen.getByTitle('Resume recording')).toBeInTheDocument();
    expect(screen.getByTitle('Stop recording')).toBeInTheDocument();
  });

  it('starting: recording-shaped pill (no size jump), empty control slot (X appears only when transcribing)', () => {
    renderInput('starting');

    // The pill mounts on mic-press, before the mic is warm; the slot stays empty so Stop/Pause arrive once.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    const pill = screen.getByTestId('dotscope');
    expect(pill).toHaveAttribute('data-stage', 'recording');
    expect(pill).toHaveAttribute('aria-label', 'Starting');
    expect(screen.queryByTitle('Stop recording')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Pause recording')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cancel voice input')).not.toBeInTheDocument();
  });

  it('transcribing: processing pill with only the master X cancel', () => {
    renderInput('transcribing');

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    const pill = screen.getByTestId('dotscope');
    expect(pill).toHaveAttribute('data-stage', 'processing');
    // Stop/Pause are gone — the X is the only control, solid red.
    expect(screen.queryByTitle('Stop recording')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Pause recording')).not.toBeInTheDocument();
    const cancel = screen.getByLabelText('Cancel voice input');
    expect(cancel).toBeInTheDocument();
    expect(cancel).toHaveClass('bg-danger');
  });

  it('Escape cancels the capture', () => {
    renderInput('recording');

    fireEvent.keyDown(screen.getByTestId('voice-pill'), { key: 'Escape' });
    expect(baseProps.onSpeechCancel).toHaveBeenCalledTimes(1);
  });

  it('holds the pill briefly after capture ends before the composer returns', async () => {
    // The harness owns capture state like the app does, so ChatInput stays mounted; real timers for the rAF beats.
    function Harness() {
      const [s, setS] = useState<SpeechState>('recording');
      return (
        <>
          <button data-testid="end-capture" onClick={() => setS('idle')} />
          <ChatInput {...baseProps} speechState={s} />
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByTestId('dotscope')).toBeInTheDocument();
    // The morphing frame outlives the whole transition — no remount, no jar.
    const frame = screen.getByTestId('composer-frame');
    expect(frame).toBeInTheDocument();

    // Capture ends: the handoff beat holds the pill, then the box stretches back while the pill fades inside it.
    fireEvent.click(screen.getByTestId('end-capture'));
    expect(screen.getByTestId('dotscope')).toBeInTheDocument();
    expect(screen.getByTestId('composer-frame')).toBe(frame);

    await waitFor(
      () => {
        expect(screen.queryByTestId('dotscope')).not.toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByTestId('composer-frame')).toBe(frame);
  });
});
