import { describe, expect, it } from 'vitest';
import { stripNonSpeech } from '@services/ai/transcription/format';

describe('stripNonSpeech', () => {
  it('drops a lone noise marker', () => expect(stripNonSpeech('<noise>')).toBe(''));
  it('drops engine markers around speech', () =>
    expect(stripNonSpeech('[BLANK_AUDIO] hello <noise> there [MUSIC]')).toBe('hello there'));
  it('keeps ordinary brackets in speech', () => expect(stripNonSpeech('item [a] and (b)')).toBe('item [a] and (b)'));
});
