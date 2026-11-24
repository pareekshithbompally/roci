import { describe, it, expect } from 'vitest';
import { isIntegrationEnabled } from '@shared/utils/integrations';
import { isSpeechSelectionReady, speechModelOptions } from '@services/ai/transcription/catalog';
import type { AppSettings } from '@shared/types';
import type { HexStatus } from '@services/ai/transcription/hex';

const hexStatus: HexStatus = {
  running: true,
  models: [
    { id: 'parakeet', name: 'Parakeet', installed: true },
    { id: 'apple_speech', name: 'Apple Speech', installed: true },
  ],
};
const hexIds = (hexEnabled: boolean) =>
  speechModelOptions([], hexEnabled ? { hex: { status: hexStatus } } : {}).filter((o) => o.provider === 'hex').map((o) => o.model);

describe('integration gate', () => {
  it('reads each integration switch from settings', () => {
    expect(isIntegrationEnabled({ hexIntegration: { enabled: true } } as AppSettings, 'hex')).toBe(true);
    expect(isIntegrationEnabled({} as AppSettings, 'hex')).toBe(false);
    expect(isIntegrationEnabled({ remindersIntegration: { enabled: true } } as AppSettings, 'hex')).toBe(false);
  });

  it('Hex models appear only while Hex is on, never Apple speech', () => {
    expect(hexIds(true)).toEqual(['parakeet']);
    expect(hexIds(false)).toEqual([]);
  });

  it('a saved Hex selection is not ready while Hex is off', () => {
    const selection = { provider: 'hex', model: 'parakeet' };
    expect(isSpeechSelectionReady(selection, [], { hex: { status: hexStatus } })).toBe(true);
    expect(isSpeechSelectionReady(selection, [], {})).toBe(false);
  });

  it('Apple Speech appears only while Apple Intelligence is on, ready once allowed and downloaded', () => {
    const apple = (status: { available: boolean; authorization: 'authorized' | 'not_determined'; installed: boolean }) =>
      speechModelOptions([], { appleSpeech: { status: { ...status, languages: ['en-US'] } } }).find((o) => o.provider === 'apple-intelligence');
    expect(speechModelOptions([], {}).some((o) => o.provider === 'apple-intelligence')).toBe(false);
    expect(apple({ available: true, authorization: 'authorized', installed: true })).toMatchObject({ ready: true, hint: null });
    expect(apple({ available: true, authorization: 'not_determined', installed: true })?.hint).toBe('Allow Speech Recognition');
    expect(apple({ available: true, authorization: 'authorized', installed: false })?.hint).toBe('Download the speech model for your spoken language');
  });
});
