import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { AppSettings } from '@shared/types';

const speech = vi.hoisted(() => ({ stop: vi.fn<() => Promise<string>>() }));
vi.mock('@features/chat/hooks/useSpeechInput', () => ({
  useSpeechInput: () => ({ state: 'idle', ended: null, liveLost: false, stream: null, liveText: null, elapsed: 0, start: vi.fn(), stop: speech.stop, cancel: vi.fn() }),
}));
vi.mock('@features/settings', () => ({ useLiveDictation: () => null }));
const haptics = vi.hoisted(() => ({ haptic: vi.fn() }));
vi.mock('@platform/haptics', () => haptics);

// eslint-disable-next-line import/first
import { useVoiceCapture } from '@features/chat/hooks/useVoiceCapture';

/** Stop puts words in the box; Send sends them only once the pill has left (docs/plans/IN-PROGRESS/dictation-flow.md). */
describe('useVoiceCapture', () => {
  const appendTranscript = vi.fn();
  const send = vi.fn();
  const renderVoice = () => renderHook(() => useVoiceCapture({ settings: {} as AppSettings, providers: [], appendTranscript, send }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('D9 Stop appends the words to the draft', async () => {
    speech.stop.mockResolvedValue('Ship it Friday.');
    const { result } = renderVoice();
    await act(() => result.current.handleSpeechStop());
    expect(appendTranscript).toHaveBeenCalledWith('Ship it Friday.');
    expect(send).not.toHaveBeenCalled();
  });

  it('D10/D11 Send waits for the pill to leave, then appends and sends once', async () => {
    speech.stop.mockResolvedValue('Ship it Friday.');
    const { result } = renderVoice();
    await act(() => result.current.handleSpeechSend());
    expect(result.current.ending).toBe('send');
    expect(send).not.toHaveBeenCalled();
    act(() => result.current.handleVoiceGone());
    expect(appendTranscript).toHaveBeenCalledWith('Ship it Friday.');
    expect(send).toHaveBeenCalledTimes(1);
    act(() => result.current.handleVoiceGone());
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('D13 Send with nothing heard sends nothing', async () => {
    speech.stop.mockResolvedValue('');
    const { result } = renderVoice();
    await act(() => result.current.handleSpeechSend());
    act(() => result.current.handleVoiceGone());
    expect(appendTranscript).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('a waiting Send whose composer goes away (a chat switch) stays in the draft, never sent elsewhere', async () => {
    speech.stop.mockResolvedValue('Ship it Friday.');
    const { result, unmount } = renderVoice();
    await act(() => result.current.handleSpeechSend());
    unmount();
    expect(appendTranscript).toHaveBeenCalledWith('Ship it Friday.');
    expect(send).not.toHaveBeenCalled();
  });

  describe('one tap when the words land', () => {
    it('Stop: felt once the pill has left, not when the words arrive', async () => {
      speech.stop.mockResolvedValue('Ship it Friday.');
      const { result } = renderVoice();
      await act(() => result.current.handleSpeechStop());
      expect(haptics.haptic).not.toHaveBeenCalled();
      act(() => result.current.handleVoiceGone());
      expect(haptics.haptic).toHaveBeenCalledTimes(1);
      expect(haptics.haptic).toHaveBeenCalledWith('landed');
    });

    it('Send: felt once, with the message', async () => {
      speech.stop.mockResolvedValue('Ship it Friday.');
      const { result } = renderVoice();
      await act(() => result.current.handleSpeechSend());
      act(() => result.current.handleVoiceGone());
      act(() => result.current.handleVoiceGone());
      expect(haptics.haptic).toHaveBeenCalledTimes(1);
    });

    it('nothing heard, or a cancel: nothing landed, nothing felt', async () => {
      speech.stop.mockResolvedValue('');
      const { result } = renderVoice();
      await act(() => result.current.handleSpeechStop());
      act(() => result.current.handleVoiceGone());
      act(() => result.current.handleVoiceGone());
      expect(haptics.haptic).not.toHaveBeenCalled();
    });
  });
});
