import { describe, expect, it } from 'vitest';
import { aiSetupStep } from '@features/settings/hooks/useAIReadiness';

const ready = { text: true, speech: true, chat: true, summary: true };

describe('aiSetupStep: what home asks to set up next', () => {
  it('asks for a provider first, whatever else is set', () => {
    expect(aiSetupStep({ ...ready, text: false })).toEqual({ panel: 'providers' });
  });

  it('then counts the default models still to choose', () => {
    expect(aiSetupStep({ ...ready, chat: false, summary: false })).toEqual({ panel: 'defaultModels', left: 2 });
    expect(aiSetupStep({ ...ready, speech: false })).toEqual({ panel: 'defaultModels', left: 1 });
  });

  it('is done once chat, transcription and summaries are set', () => {
    expect(aiSetupStep(ready)).toBeNull();
  });
});
