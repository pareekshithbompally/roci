import { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import type { LiveText } from '@services/ai/transcription';
import { ChatInput } from '@features/chat/components/ChatInput';
import { VoicePill } from '@features/chat/components/voice/VoicePill';
import type { SpeechState } from '@features/chat/hooks/useSpeechInput';
import type { VoiceEnding } from '@features/chat/hooks/useVoiceCapture';

/** ChatInput reads server state (model picker, tools) through TanStack Query. */
const render = (ui: ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

/** The Horizon canvas is irrelevant to capture-state wiring — stub it. */
vi.mock('@features/chat/components/horizon', () => ({
  Horizon: (props: { stage: string; label: string }) => (
    <div data-testid="horizon" data-stage={props.stage} aria-label={props.label} />
  ),
}));

/** Pickers need Settings/Tauri providers, so stub them to keep the test on the pill/composer swap. */
vi.mock('@features/chat/components/tools/ToolsPicker', () => ({
  ToolsPicker: () => null,
}));
vi.mock('@features/chat/components/ModelPicker', () => ({
  ModelPicker: () => null,
}));
vi.mock('@features/chat/components/ReasoningPicker', () => ({
  ReasoningPicker: () => null,
}));
/** What the composer may attach depends on the chat's model (Settings): any file here. */
vi.mock('@features/chat/hooks/useAttachOptions', () => ({ useAttachOptions: () => ({ accept: '*', options: [], images: false }) }));
/** The tool catalog reads Settings; the composer only hands it to the (stubbed) pickers and the context ring. */
vi.mock('@features/chat/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/hooks')>()),
  useToolCatalog: () => ({ modelSupportsTools: false, enabledCount: 0, enabledTokens: 0 }),
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
  onSpeechSend: vi.fn(),
  onSpeechCancel: vi.fn(),
};

const STOP = 'Stop and put the words in the box';
const SEND = 'Send';
const CANCEL = 'Cancel voice input';
const LIVE: LiveText = { committed: 'Draft the note', tentative: ' to the team' };

type Props = Partial<React.ComponentProps<typeof ChatInput>>;
const renderInput = (speechState: SpeechState, props: Props = {}) =>
  render(<ChatInput {...baseProps} speechState={speechState} {...props} />);

/** Ends a capture the way the app does (state and ending in one render), from `from`, and returns the trigger. */
function renderEnding(ending: VoiceEnding, props: Props = {}, from: SpeechState = 'transcribing') {
  function Harness() {
    const [state, setState] = useState<SpeechState>(from);
    const [end, setEnd] = useState<VoiceEnding>('box');
    return (
      <>
        <button data-testid="end" onClick={() => { setEnd(ending); setState('idle'); }} />
        <ChatInput {...baseProps} speechState={state} speechEnding={end} {...props} />
      </>
    );
  }
  render(<Harness />);
  return () => fireEvent.click(screen.getByTestId('end'));
}

const pillGone = () => waitFor(() => expect(screen.queryByTestId('horizon')).not.toBeInTheDocument(), { timeout: 3000 });

/** One test per moment of docs/plans/IN-PROGRESS/dictation-flow.md. */
describe('Dictation flow', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('idle: the composer box, no voice area', () => {
    renderInput('idle');
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByTitle('Voice input')).toBeInTheDocument();
    expect(screen.queryByTestId('horizon')).not.toBeInTheDocument();
  });

  it('D1 tap mic: the box goes inert under a recording line and "Listening…"; nothing at the line end yet', () => {
    renderInput('starting');
    const box = screen.getByTestId('composer-box');
    expect(box).toHaveAttribute('aria-hidden', 'true');
    expect(box).toHaveAttribute('inert');
    expect(screen.getByTestId('horizon')).toHaveAttribute('data-stage', 'recording');
    expect(screen.getByTestId('horizon')).toHaveAttribute('aria-label', 'Starting');
    expect(screen.getByText('Listening…')).toBeInTheDocument();
    expect(screen.queryByTitle(STOP)).not.toBeInTheDocument();
    expect(screen.queryByTitle(SEND)).not.toBeInTheDocument();
  });

  it('D2 mic warm: the clock, Stop and Send at the line end, each doing its job', () => {
    renderInput('recording');
    expect(screen.getByText('00:05')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle(STOP));
    expect(baseProps.onSpeechStop).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTitle(SEND));
    expect(baseProps.onSpeechSend).toHaveBeenCalledTimes(1);
  });

  it('D3 the mic never opens: the voice area leaves at once, with no teal "transcribing" beat', () => {
    const end = renderEnding('quiet', {}, 'starting');
    end();
    expect(screen.getByTestId('composer-box')).not.toHaveAttribute('inert');
  });

  it('D4 speaking, live: the words show above the line', () => {
    renderInput('recording', { liveText: LIVE });
    expect(screen.getByText(/Draft the note/)).toBeInTheDocument();
    expect(screen.queryByText('Listening…')).not.toBeInTheDocument();
  });

  it('D5 speaking, recorded: "Listening…" stays', () => {
    renderInput('recording');
    expect(screen.getByText('Listening…')).toBeInTheDocument();
  });

  it('D6 the live stream drops: its words stay, with a note that the recording will be transcribed', () => {
    renderInput('recording', { liveText: LIVE, speechLiveLost: true });
    expect(screen.getByText(/Draft the note/)).toBeInTheDocument();
    expect(screen.getByText('Live text stopped — the recording will be transcribed')).toBeInTheDocument();
  });

  it('D7 stop, live: the words are written already, so no "Transcribing" label — Cancel only', () => {
    renderInput('transcribing', { liveText: LIVE });
    expect(screen.getByTestId('horizon')).toHaveAttribute('data-stage', 'processing');
    expect(screen.queryByText('Transcribing…')).not.toBeInTheDocument();
    expect(screen.getByLabelText(CANCEL)).toBeInTheDocument();
    expect(screen.queryByTitle(STOP)).not.toBeInTheDocument();
  });

  it.each([
    ['recorded', {}],
    ['after the live stream dropped', { liveText: LIVE, speechLiveLost: true }],
  ] as const)('D8 stop, %s: "Transcribing…" with Cancel', (_case, props) => {
    renderInput('transcribing', props);
    expect(screen.getByText('Transcribing…')).toBeInTheDocument();
    expect(screen.getByLabelText(CANCEL)).toBeInTheDocument();
  });

  it('D9 ends box: holds its beat, then the box returns', async () => {
    const end = renderEnding('box');
    end();
    expect(screen.getByTestId('horizon')).toBeInTheDocument();
    expect(screen.getByTestId('composer-box')).toHaveAttribute('inert');
    await pillGone();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('D10/D11 ends send: lets go in the same render, and says it is gone only once its exit has played', async () => {
    const onVoiceGone = vi.fn();
    const end = renderEnding('send', { onVoiceGone });
    end();
    expect(screen.getByTestId('composer-box')).not.toHaveAttribute('inert');
    expect(onVoiceGone).not.toHaveBeenCalled();
    await waitFor(() => expect(onVoiceGone).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });

  it('D12 a reply is being written: Send is off, so words can only go into the box', () => {
    renderInput('recording', { isLoading: true });
    expect(screen.getByTitle(SEND)).toBeDisabled();
    expect(screen.getByTitle(STOP)).toBeEnabled();
  });

  it('D13 ends empty: says it caught nothing, holds, then the box returns', async () => {
    const end = renderEnding('empty');
    end();
    // The end slot fades its old content out before the message comes in.
    expect(await screen.findByText('Didn’t catch anything')).toBeInTheDocument();
    await pillGone();
  });

  it('D14 ends failed: red line and "Couldn’t transcribe", then the box returns', async () => {
    const end = renderEnding('failed');
    end();
    expect(screen.getByTestId('horizon')).toHaveAttribute('data-stage', 'failed');
    expect(await screen.findByText('Couldn’t transcribe')).toBeInTheDocument();
    await pillGone();
  });

  it.each(['starting', 'recording', 'transcribing'] as const)('D15 cancel while %s: Escape and ✕ both cancel (a phone has only ✕)', (state) => {
    renderInput(state);
    fireEvent.keyDown(screen.getByTestId('voice-pill'), { key: 'Escape' });
    expect(baseProps.onSpeechCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText(CANCEL));
    expect(baseProps.onSpeechCancel).toHaveBeenCalledTimes(2);
  });

  it('D15 once the words are in there is nothing to cancel: ✕ leaves while the ending holds', async () => {
    const end = renderEnding('empty');
    end();
    await waitFor(() => expect(screen.queryByLabelText(CANCEL)).not.toBeInTheDocument());
    expect(screen.getByTestId('voice-pill')).toBeInTheDocument();
  });

  it('D16 over a conversation the words get a backdrop; on home they don’t', () => {
    const { unmount } = renderInput('recording', { overContent: true });
    expect(screen.getByTestId('voice-backdrop')).toBeInTheDocument();
    unmount();
    renderInput('recording');
    expect(screen.queryByTestId('voice-backdrop')).not.toBeInTheDocument();
  });

  it('D17 iPhone: Cancel, Stop and Send take the composer’s 44 pt control size', () => {
    const pill = { active: true, stage: 'recording', ending: 'box', label: 'Recording' } as const;
    render(
      <VoicePill pill={pill} speechState="recording" stream={null} liveText={null} elapsed={5} reduceMotion={false}
        canSend liveLost={false} backdrop={false} controlSize="md" stacked />,
    );
    expect(screen.getByTitle(STOP)).toHaveClass('h-control-md');
    expect(screen.getByTitle(SEND)).toHaveClass('h-control-md');
    expect(screen.getByLabelText(CANCEL)).toHaveClass('h-control-md');
  });
});

describe('ChatInput attachments', () => {
  const photo = { type: 'file' as const, mediaType: 'image/png', url: 'data:image/png;base64,AA==', filename: 'photo.png' };
  const pdf = { type: 'file' as const, mediaType: 'application/pdf', url: 'data:application/pdf;base64,AA==', filename: 'plan.pdf' };
  const clip = { type: 'file' as const, mediaType: 'audio/wav', url: 'data:audio/wav;base64,AA==' };

  it('shows each attachment by name (an unnamed one by its kind), and removes the one asked', () => {
    const onRemoveAttachment = vi.fn();
    render(<ChatInput {...baseProps} speechState="idle" attachments={[photo, pdf, clip]} onRemoveAttachment={onRemoveAttachment} />);
    expect(screen.getByText('photo.png')).toBeInTheDocument();
    expect(screen.getByText('plan.pdf')).toBeInTheDocument();
    expect(screen.getByText('Audio')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove attachment' })[1]);
    expect(onRemoveAttachment).toHaveBeenCalledWith(1);
  });

  it('opens an image attachment full size', async () => {
    render(<ChatInput {...baseProps} speechState="idle" attachments={[photo]} />);
    fireEvent.click(screen.getByRole('button', { name: 'photo.png' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  });
});
