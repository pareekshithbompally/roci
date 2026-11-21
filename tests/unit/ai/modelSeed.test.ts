/** Speech providers models.dev doesn't list are described by Roci's seed, through the one catalog lookup. */

import { describe, it, expect } from 'vitest';
import { profileOf } from '@services/ai/models';
import { modalitiesService } from '@services/modalities';
import { costOf, priceOf } from '@extensions/usage/pricing';

describe('the model seed', () => {
  it('describes a speech provider\'s models as the catalog would: speech-to-text and voices apart', () => {
    expect(profileOf('elevenlabs', { id: 'scribe_v3' })).toMatchObject({ input: ['audio'], output: ['text'], sourceOf: { input: 'catalog' } });
    expect(profileOf('elevenlabs', { id: 'eleven_v3' })).toMatchObject({ input: ['text'], output: ['audio'], sourceOf: { input: 'catalog' } });
    expect(profileOf('deepgram', { id: 'nova-3' })).toMatchObject({ input: ['audio'], output: ['text'], sourceOf: { input: 'catalog' } });
  });

  it('a Deepgram voice it doesn\'t list is still known by its name', () => {
    expect(profileOf('deepgram', { id: 'aura-2-thalia-en' })).toMatchObject({ input: ['text'], output: ['audio'] });
  });

  it('prices a seeded model through the one price rule: by the minute where one is published, unknown where none is', () => {
    expect(costOf(priceOf([], 'elevenlabs', 'scribe_v3'), undefined, 60 * 60)).toBeCloseTo(0.2, 12);
    expect(costOf(priceOf([], 'deepgram', 'nova-3'), undefined, 60)).toBeCloseTo(0.0043, 12);
    expect(priceOf([], 'elevenlabs', 'eleven_v3')).toBeNull();
  });

  it('Add Model offers a speech provider\'s seeded models', () => {
    const ids = modalitiesService.seededModels('deepgram').map((m) => m.id);
    expect(ids).toContain('nova-3');
    expect(ids).toContain('flux-general-en');
    expect(modalitiesService.seededModels('openai')).toEqual([]);
  });
});
