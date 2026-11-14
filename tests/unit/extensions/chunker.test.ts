import { describe, it, expect } from 'vitest';
import { chunkMeeting, computeContentHash } from '@extensions/rag/chunker';
import { MAX_CHUNK_CHARS } from '@extensions/rag/constants';
import type { HistoryItem } from '@shared/types';

const makeItem = (overrides: Partial<Record<string, unknown>> = {}): HistoryItem =>
  ({
    id: 'test-1',
    title: 'Test Meeting',
    timestamp: Date.now(),
    summary: overrides.summary ?? 'A test summary.',
    transcript: overrides.transcript ?? '',
    userNotes: overrides.userNotes ?? [],
    userActionItems: overrides.userActionItems ?? [],
    ...overrides,
  }) as unknown as HistoryItem;

describe('chunkMeeting', () => {
  describe('title and summary', () => {
    it('produces a title_summary chunk for a title-only meeting', () => {
      const item = makeItem({ summary: '', transcript: '' });
      const chunks = chunkMeeting(item);

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].type).toBe('title_summary');
      expect(chunks[0].text).toContain('Test Meeting');
      expect(chunks[0].index).toBe(0);
    });

    it('includes both title and summary in the title_summary chunk', () => {
      const item = makeItem({ transcript: '' });
      const chunks = chunkMeeting(item);

      expect(chunks[0].type).toBe('title_summary');
      expect(chunks[0].text).toContain('Test Meeting');
      expect(chunks[0].text).toContain('A test summary.');
    });

    it('produces empty array when all fields are empty', () => {
      const item = makeItem({ title: '', summary: '', transcript: '', userNotes: [], userActionItems: [] });
      const chunks = chunkMeeting(item);

      expect(chunks).toEqual([]);
    });

    it('produces title_summary without summary when summary is empty', () => {
      const item = makeItem({ summary: '' });
      const chunks = chunkMeeting(item);

      const titleChunk = chunks.find(c => c.type === 'title_summary');
      expect(titleChunk).toBeDefined();
      expect(titleChunk!.text).toBe('Test Meeting');
    });
  });

  describe('transcript chunking', () => {
    it('keeps a short transcript as a single chunk', () => {
      const item = makeItem({ transcript: 'Hello world. This is a short transcript.' });
      const chunks = chunkMeeting(item);

      const transcriptChunks = chunks.filter(c => c.type === 'transcript');
      expect(transcriptChunks).toHaveLength(1);
      expect(transcriptChunks[0].text).toBe('Hello world. This is a short transcript.');
    });

    it('splits a long transcript into multiple chunks', () => {
      // Generate text longer than MAX_CHUNK_CHARS with sentence boundaries
      const sentence = 'This is a test sentence with some content. ';
      const longTranscript = sentence.repeat(Math.ceil((MAX_CHUNK_CHARS * 3) / sentence.length));
      const item = makeItem({ transcript: longTranscript });

      const chunks = chunkMeeting(item);
      const transcriptChunks = chunks.filter(c => c.type === 'transcript');

      expect(transcriptChunks.length).toBeGreaterThan(1);
    });

    it('does not create transcript chunks for empty transcript', () => {
      const item = makeItem({ transcript: '' });
      const chunks = chunkMeeting(item);

      expect(chunks.filter(c => c.type === 'transcript')).toHaveLength(0);
    });

    it('does not create transcript chunks for whitespace-only transcript', () => {
      const item = makeItem({ transcript: '   \n\t  ' });
      const chunks = chunkMeeting(item);

      expect(chunks.filter(c => c.type === 'transcript')).toHaveLength(0);
    });

    it('transcript chunks have startPos and endPos', () => {
      const item = makeItem({ transcript: 'Hello world. This is a transcript.' });
      const chunks = chunkMeeting(item);
      const transcriptChunks = chunks.filter(c => c.type === 'transcript');

      for (const chunk of transcriptChunks) {
        expect(chunk.startPos).toBeDefined();
        expect(chunk.endPos).toBeDefined();
        expect(typeof chunk.startPos).toBe('number');
        expect(typeof chunk.endPos).toBe('number');
      }
    });
  });

  describe('notes chunking', () => {
    it('creates notes chunk when combined notes exceed MIN_NOTES_LENGTH', () => {
      const item = makeItem({
        userNotes: [{ text: 'Important note about the meeting discussion topic' }],
      });
      const chunks = chunkMeeting(item);
      const notesChunks = chunks.filter(c => c.type === 'notes');

      expect(notesChunks).toHaveLength(1);
      expect(notesChunks[0].text).toContain('Important note about the meeting discussion topic');
    });

    it('excludes notes when combined length is below MIN_NOTES_LENGTH', () => {
      const item = makeItem({
        userNotes: [{ text: 'Short' }],
      });
      const chunks = chunkMeeting(item);

      expect(chunks.filter(c => c.type === 'notes')).toHaveLength(0);
    });

    it('combines userNotes and userActionItems into notes chunk', () => {
      const item = makeItem({
        userNotes: [{ text: 'Note about the project' }],
        userActionItems: [{ text: 'Follow up on deliverables' }],
      });
      const chunks = chunkMeeting(item);
      const notesChunks = chunks.filter(c => c.type === 'notes');

      expect(notesChunks).toHaveLength(1);
      expect(notesChunks[0].text).toContain('Note about the project');
      expect(notesChunks[0].text).toContain('Follow up on deliverables');
    });

    it('action items alone can create a notes chunk', () => {
      const item = makeItem({
        userNotes: [],
        userActionItems: [{ text: 'Complete the quarterly report review' }],
      });
      const chunks = chunkMeeting(item);

      expect(chunks.filter(c => c.type === 'notes')).toHaveLength(1);
    });

    it('filters out empty note texts', () => {
      const item = makeItem({
        userNotes: [{ text: '' }, { text: 'A valid note that is long enough' }],
        userActionItems: [],
      });
      const chunks = chunkMeeting(item);
      const notesChunks = chunks.filter(c => c.type === 'notes');

      if (notesChunks.length > 0) {
        expect(notesChunks[0].text.startsWith('.')).toBe(false);
      }
    });
  });

  describe('chunk indices', () => {
    it('indices are sequential starting from 0', () => {
      const sentence = 'This is a sufficiently long sentence for testing. ';
      const item = makeItem({
        transcript: sentence.repeat(Math.ceil((MAX_CHUNK_CHARS * 2) / sentence.length)),
        userNotes: [{ text: 'A note that is definitely long enough for inclusion' }],
      });
      const chunks = chunkMeeting(item);

      for (let i = 0; i < chunks.length; i++) {
        expect(chunks[i].index).toBe(i);
      }
    });

    it('title_summary is always index 0 when present', () => {
      const item = makeItem({ transcript: 'Some transcript content.' });
      const chunks = chunkMeeting(item);

      expect(chunks[0].type).toBe('title_summary');
      expect(chunks[0].index).toBe(0);
    });
  });

  describe('chunk types', () => {
    it('only produces recognized chunk types', () => {
      const sentence = 'A repeated sentence for generating content. ';
      const item = makeItem({
        transcript: sentence.repeat(100),
        userNotes: [{ text: 'Meeting notes with sufficient length for inclusion' }],
      });
      const chunks = chunkMeeting(item);
      const validTypes = new Set(['title_summary', 'transcript', 'notes']);

      for (const chunk of chunks) {
        expect(validTypes.has(chunk.type)).toBe(true);
      }
    });
  });
});

describe('computeContentHash', () => {
  it('same content produces same hash', async () => {
    const item = makeItem();
    const hash1 = await computeContentHash(item);
    const hash2 = await computeContentHash(item);

    expect(hash1).toBe(hash2);
  });

  it('different content produces different hash', async () => {
    const item1 = makeItem({ title: 'Meeting A' });
    const item2 = makeItem({ title: 'Meeting B' });

    const hash1 = await computeContentHash(item1);
    const hash2 = await computeContentHash(item2);

    expect(hash1).not.toBe(hash2);
  });

  it('returns a 64-character hex string (SHA-256)', async () => {
    const hash = await computeContentHash(makeItem());

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changing title changes the hash', async () => {
    const base = makeItem();
    const modified = makeItem({ title: 'Different Title' });

    expect(await computeContentHash(base)).not.toBe(await computeContentHash(modified));
  });

  it('changing summary changes the hash', async () => {
    const base = makeItem();
    const modified = makeItem({ summary: 'Different summary.' });

    expect(await computeContentHash(base)).not.toBe(await computeContentHash(modified));
  });

  it('changing transcript changes the hash', async () => {
    const base = makeItem();
    const modified = makeItem({ transcript: 'New transcript content.' });

    expect(await computeContentHash(base)).not.toBe(await computeContentHash(modified));
  });

  it('changing userNotes changes the hash', async () => {
    const base = makeItem({ userNotes: [] });
    const modified = makeItem({ userNotes: [{ text: 'Added note' }] });

    expect(await computeContentHash(base)).not.toBe(await computeContentHash(modified));
  });

  it('changing userActionItems changes the hash', async () => {
    const base = makeItem({ userActionItems: [] });
    const modified = makeItem({ userActionItems: [{ text: 'New action' }] });

    expect(await computeContentHash(base)).not.toBe(await computeContentHash(modified));
  });

  it('handles items with all empty fields', async () => {
    const item = makeItem({ title: '', summary: '', transcript: '', userNotes: [], userActionItems: [] });
    const hash = await computeContentHash(item);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
