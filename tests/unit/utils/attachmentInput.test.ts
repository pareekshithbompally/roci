import { describe, expect, it } from 'vitest';
import { attachmentInput, attachmentMediaType } from '@shared/utils/chatParts';
import { dataUrlText } from '@shared/utils/file.utils';

describe('attachmentInput', () => {
  it('names what a model must take to read a file', () => {
    expect(attachmentInput('image/png', 'a.png')).toBe('image');
    expect(attachmentInput('audio/mpeg', 'a.mp3')).toBe('audio');
    expect(attachmentInput('video/mp4', 'a.mp4')).toBe('video');
    expect(attachmentInput('application/pdf', 'q3.pdf')).toBe('pdf');
  });

  it('knows a text file by its type, or by its extension when the system gave it none', () => {
    expect(attachmentInput('text/plain', 'a.txt')).toBe('text');
    expect(attachmentInput('application/json', 'a.json')).toBe('text');
    expect(attachmentInput('application/octet-stream', 'NOTES.MD')).toBe('text');
    expect(attachmentInput('', 'q3.pdf')).toBe('pdf');
  });

  it('is none for a file no model reads', () => {
    expect(attachmentInput('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'brief.docx')).toBeNull();
    expect(attachmentInput('application/zip', 'a.zip')).toBeNull();
  });
});

describe('dataUrlText', () => {
  it('reads UTF-8 text from base64 and plain data URLs; anything else is null', () => {
    const utf8 = btoa(String.fromCharCode(...new TextEncoder().encode('café ✓')));
    expect(dataUrlText(`data:text/plain;base64,${utf8}`)).toBe('café ✓');
    expect(dataUrlText('data:text/plain,a%20b')).toBe('a b');
    expect(dataUrlText('https://example.com/a.txt')).toBeNull();
    expect(dataUrlText(`data:application/octet-stream;base64,${btoa('\xff\xfe\xfd')}`)).toBeNull();
  });
});

describe('attachmentMediaType', () => {
  it('keeps a PDF as a PDF even when the system named no type, and any other file as given', () => {
    expect(attachmentMediaType('', 'q3.pdf')).toBe('application/pdf');
    expect(attachmentMediaType('application/octet-stream', 'Q3.PDF')).toBe('application/pdf');
    expect(attachmentMediaType('text/csv', 'a.csv')).toBe('text/csv');
    expect(attachmentMediaType('', 'a.bin')).toBe('application/octet-stream');
  });
});
