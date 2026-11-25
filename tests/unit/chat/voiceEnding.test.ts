import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { HORIZON_CONFIG } from '@config/horizon.config';
import { voiceEnding } from '@features/chat/hooks/useVoiceCapture';
import type { VoiceEnding } from '@features/chat/hooks/useVoiceCapture';
import type { SpeechState } from '@features/chat/hooks/useSpeechInput';
import { useVoicePill } from '@features/chat/components/voice/useVoicePill';

/** The one ending model (docs/plans/IN-PROGRESS/dictation-flow.md). */
describe('voiceEnding', () => {
  it.each([
    [null, 'box', 'box'],
    [null, 'send', 'send'],
    ['text', 'box', 'box'],
    ['text', 'send', 'send'],
    ['empty', 'send', 'empty'],
    ['failed', 'send', 'failed'],
    ['aborted', 'send', 'quiet'],
  ] as const)('speech ended %s with intent %s → %s', (ended, intent, expected) => {
    expect(voiceEnding(ended, intent)).toBe(expected);
  });
});

describe('useVoicePill holds per ending', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Ends a capture with `ending` and reports whether the pill is still up just before and just after its hold. */
  function endWith(ending: VoiceEnding) {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ state, end }: { state: SpeechState; end: VoiceEnding }) => useVoicePill(state, end),
      { initialProps: { state: 'transcribing' as SpeechState, end: ending } },
    );
    expect(result.current.active).toBe(true);
    rerender({ state: 'idle', end: ending });
    return result;
  }

  it.each([
    ['box', 'processing', 'D9'],
    ['empty', 'processing', 'D13'],
    ['failed', 'failed', 'D14'],
  ] as const)('%s holds for its configured beat, showing %s (%s)', (ending, stage, _row) => {
    const pill = endWith(ending);
    const hold = HORIZON_CONFIG.composer.hold[ending] * 1000;
    expect(pill.current.active).toBe(true);
    expect(pill.current.stage).toBe(stage);
    expect(pill.current.ending).toBe(ending);
    act(() => vi.advanceTimersByTime(hold - 1));
    expect(pill.current.active).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(pill.current.active).toBe(false);
  });

  it.each([
    ['send', 'D10/D11: it leaves with the message'],
    ['quiet', 'D3/D15: a cancel or a mic that never opened leaves at once'],
  ] as const)('%s lets go in the render that ends capture — %s', (ending, _why) => {
    const pill = endWith(ending);
    expect(pill.current.active).toBe(false);
  });
});
