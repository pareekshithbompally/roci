import { describe, it, expect } from 'vitest';
import {
  isEmpty,
  isValidEmail,
  isValidUrl,
  isInRange,
  hasValidExtension,
  isValidFileSize,
  isValidAudioFile,
} from '@shared/utils/validators';

describe('isEmpty', () => {
  it('returns true for null', () => {
    expect(isEmpty(null)).toBe(true);
  });

  it('returns true for undefined', () => {
    expect(isEmpty(undefined)).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(isEmpty('')).toBe(true);
  });

  it('returns true for whitespace-only string', () => {
    expect(isEmpty('   ')).toBe(true);
    expect(isEmpty('\t\n')).toBe(true);
  });

  it('returns false for non-empty string', () => {
    expect(isEmpty('hello')).toBe(false);
  });

  it('returns false for string with spaces and content', () => {
    expect(isEmpty('  hello  ')).toBe(false);
  });
});

describe('isValidEmail', () => {
  it('accepts valid email addresses', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('test.name@domain.co')).toBe(true);
    expect(isValidEmail('user+tag@example.org')).toBe(true);
  });

  it('rejects email without @', () => {
    expect(isValidEmail('userexample.com')).toBe(false);
  });

  it('rejects email without domain', () => {
    expect(isValidEmail('user@')).toBe(false);
  });

  it('rejects email without TLD', () => {
    expect(isValidEmail('user@domain')).toBe(false);
  });

  it('rejects email with spaces', () => {
    expect(isValidEmail('user @example.com')).toBe(false);
    expect(isValidEmail('user@ example.com')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });

  it('rejects double @', () => {
    expect(isValidEmail('user@@example.com')).toBe(false);
  });
});

describe('isValidUrl', () => {
  it('accepts valid http URLs', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
  });

  it('accepts valid https URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('https://example.com/path?q=1')).toBe(true);
  });

  it('accepts URLs with ports', () => {
    expect(isValidUrl('http://localhost:3000')).toBe(true);
  });

  it('rejects plain text', () => {
    expect(isValidUrl('not a url')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidUrl('')).toBe(false);
  });

  it('rejects relative paths', () => {
    expect(isValidUrl('/path/to/thing')).toBe(false);
    expect(isValidUrl('path/to/thing')).toBe(false);
  });

  it('accepts non-http schemes (URL constructor accepts them)', () => {
    // URL constructor accepts ftp://, data:, etc.
    expect(isValidUrl('ftp://files.example.com')).toBe(true);
  });
});

describe('isInRange', () => {
  it('returns true when value is within range', () => {
    expect(isInRange(5, 1, 10)).toBe(true);
  });

  it('returns true at minimum boundary', () => {
    expect(isInRange(1, 1, 10)).toBe(true);
  });

  it('returns true at maximum boundary', () => {
    expect(isInRange(10, 1, 10)).toBe(true);
  });

  it('returns false below range', () => {
    expect(isInRange(0, 1, 10)).toBe(false);
  });

  it('returns false above range', () => {
    expect(isInRange(11, 1, 10)).toBe(false);
  });

  it('handles negative ranges', () => {
    expect(isInRange(-5, -10, 0)).toBe(true);
    expect(isInRange(-11, -10, 0)).toBe(false);
  });

  it('handles zero-width range', () => {
    expect(isInRange(5, 5, 5)).toBe(true);
    expect(isInRange(4, 5, 5)).toBe(false);
  });

  it('handles floating point values', () => {
    expect(isInRange(0.5, 0, 1)).toBe(true);
    expect(isInRange(1.1, 0, 1)).toBe(false);
  });
});

describe('hasValidExtension', () => {
  it('returns true for allowed extension', () => {
    expect(hasValidExtension('file.mp3', ['mp3', 'wav'])).toBe(true);
  });

  it('returns false for disallowed extension', () => {
    expect(hasValidExtension('file.exe', ['mp3', 'wav'])).toBe(false);
  });

  it('returns false for file with no extension', () => {
    expect(hasValidExtension('noextension', ['mp3', 'wav'])).toBe(false);
  });

  it('is case insensitive', () => {
    expect(hasValidExtension('file.MP3', ['mp3'])).toBe(true);
    expect(hasValidExtension('file.Wav', ['wav'])).toBe(true);
  });

  it('handles multiple dots in filename', () => {
    expect(hasValidExtension('my.file.name.mp3', ['mp3'])).toBe(true);
  });

  it('returns false for empty allowed list', () => {
    expect(hasValidExtension('file.mp3', [])).toBe(false);
  });

  it('handles dot-only filename', () => {
    // 'file.' -> pop() returns ''
    expect(hasValidExtension('file.', ['mp3'])).toBe(false);
  });
});

describe('isValidFileSize', () => {
  it('returns true when file is under the limit', () => {
    expect(isValidFileSize(1000, 1)).toBe(true); // 1000 bytes < 1 MB
  });

  it('returns true when file is exactly at the limit', () => {
    expect(isValidFileSize(1048576, 1)).toBe(true); // exactly 1 MB
  });

  it('returns false when file exceeds the limit', () => {
    expect(isValidFileSize(1048577, 1)).toBe(false); // 1 byte over 1 MB
  });

  it('handles zero size', () => {
    expect(isValidFileSize(0, 1)).toBe(true);
  });

  it('handles large limits', () => {
    expect(isValidFileSize(500 * 1024 * 1024, 500)).toBe(true);
  });
});

describe('isValidAudioFile', () => {
  function makeFile(name: string, type: string, size: number): File {
    const blob = new Blob(['x'.repeat(size)], { type });
    return new File([blob], name, { type });
  }

  it('accepts valid audio types', () => {
    expect(isValidAudioFile(makeFile('test.mp3', 'audio/mpeg', 1000)).valid).toBe(true);
    expect(isValidAudioFile(makeFile('test.wav', 'audio/wav', 1000)).valid).toBe(true);
    expect(isValidAudioFile(makeFile('test.webm', 'audio/webm', 1000)).valid).toBe(true);
    expect(isValidAudioFile(makeFile('test.ogg', 'audio/ogg', 1000)).valid).toBe(true);
    expect(isValidAudioFile(makeFile('test.m4a', 'audio/x-m4a', 1000)).valid).toBe(true);
  });

  it('accepts file with valid extension but unknown MIME type', () => {
    // Type not in allowedTypes but extension is valid
    const result = isValidAudioFile(makeFile('test.mp3', 'application/octet-stream', 1000));
    expect(result.valid).toBe(true);
  });

  it('rejects file with invalid type AND invalid extension', () => {
    const result = isValidAudioFile(makeFile('test.txt', 'text/plain', 1000));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid audio format');
  });

  it('rejects file that is too large', () => {
    // Blob gives a real byte size; a tiny limit keeps the test fast.
    const file = makeFile('test.mp3', 'audio/mpeg', 200);
    // 200 bytes > 0.0001 MB (~104 bytes)
    const result = isValidAudioFile(file, 0.0001);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('File too large');
  });

  it('uses default 500MB limit when not specified', () => {
    const smallFile = makeFile('test.mp3', 'audio/mpeg', 1000);
    const result = isValidAudioFile(smallFile);
    expect(result.valid).toBe(true);
  });

  it('rejects file with no extension and invalid type', () => {
    const result = isValidAudioFile(makeFile('noext', 'text/plain', 1000));
    expect(result.valid).toBe(false);
  });

  it('accepts audio/mp4 type', () => {
    const result = isValidAudioFile(makeFile('test.mp4', 'audio/mp4', 1000));
    expect(result.valid).toBe(true);
  });

  it('accepts audio/mp3 type', () => {
    const result = isValidAudioFile(makeFile('test.mp3', 'audio/mp3', 1000));
    expect(result.valid).toBe(true);
  });
});
