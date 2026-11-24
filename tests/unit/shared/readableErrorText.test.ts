import { describe, it, expect } from 'vitest';
import { readableErrorText } from '@shared/utils/errors';
describe('readableErrorText', () => {
  it('plain', () => expect(readableErrorText('Error: Model not found')).toBe('Model not found'));
  it('nested', () => expect(readableErrorText('{"error":{"message":"Rate limited","code":429}}')).toBe('Rate limited'));
  it('stringified', () => expect(readableErrorText(JSON.stringify(JSON.stringify({ error: { message: 'Bad key' } })))).toBe('Bad key'));
  it('error string', () => expect(readableErrorText('{"error":"quota exceeded"}')).toBe('quota exceeded'));
  it('message json', () => expect(readableErrorText('{"message":"{\\"error\\":{\\"message\\":\\"Deep\\"}}"}')).toBe('Deep'));
  it('none', () => expect(readableErrorText('{"status":500}')).toBe(null));
});
