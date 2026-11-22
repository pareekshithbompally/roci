import { describe, expect, it } from 'vitest';
import { featuresOf, profileOf } from '@services/ai/models';

describe('PDF input, as the user corrects it', () => {
  it('turns PDF input on for a model no source describes, shown as a feature they set', () => {
    const profile = profileOf('my-server', { id: 'my-custom-model', overrides: { pdf: true } });
    expect(profile.input).toContain('pdf');
    expect(profile.sourceOf.input).toBe('user');
    expect(featuresOf(profile)).toContainEqual({ feature: 'pdf', guessed: false });
  });

  it('turns it off again over what the sources say', () => {
    const profile = profileOf('my-server', { id: 'my-custom-model', overrides: { pdf: false } });
    expect(profile.input).not.toContain('pdf');
  });
});
