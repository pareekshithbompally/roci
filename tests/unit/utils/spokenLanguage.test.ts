import { describe, expect, it } from 'vitest';
import { languageName, matchLanguage } from '@shared/utils/spokenLanguage';

describe('spoken language', () => {
  it('matches the device language to a model in the model’s own spelling', () => {
    expect(matchLanguage('hi', ['en', 'hi'])).toBe('hi');
    expect(matchLanguage('en-IN', ['en', 'hi'])).toBe('en');
    expect(matchLanguage('en-IN', ['de-DE', 'en-US'])).toBe('en-US');
    expect(matchLanguage('de-DE', ['en', 'hi'])).toBeUndefined();
  });

  it('names a language for the user, or shows its code when the system has no name', () => {
    expect(languageName('hi')).not.toBe('');
    expect(languageName('not a tag!')).toBe('not a tag!');
  });
});
