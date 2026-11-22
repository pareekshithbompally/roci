import { describe, expect, it } from 'vitest';
import { featuresOf, profileOf } from '@services/ai/models';

describe('PDF input, as the user corrects it', () => {
  it('turns PDF input on for a model no source describes, shown as a feature they set', () => {
    const profile = profileOf('my-server', { id: 'my-custom-model', overrides: { pdf: true } });
    expect(profile.input).toContain('pdf');
    expect(profile.correctedInputs).toEqual(['pdf']);
    expect(featuresOf(profile)).toContainEqual({ feature: 'pdf', guessed: false });
  });

  it('turns it off again over what the sources say', () => {
    const profile = profileOf('my-server', { id: 'my-custom-model', overrides: { pdf: false } });
    expect(profile.input).not.toContain('pdf');
  });

  it("marks only what the user set as theirs: a guessed input stays a guess", () => {
    const profile = profileOf('my-server', { id: 'my-custom-model', reported: {}, overrides: { pdf: true, vision: true } });
    const features = featuresOf(profile);
    expect(features).toContainEqual({ feature: 'pdf', guessed: false });
    expect(features).toContainEqual({ feature: 'vision', guessed: false });
  });
});
