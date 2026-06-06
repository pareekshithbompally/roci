/**
 * Transcript Chunker
 *
 * Splits meeting content into semantically meaningful chunks for vector indexing.
 * Strategy: sentence-boundary splitting with overlap for context continuity.
 */

import type { HistoryItem } from '@shared/types';
import { MAX_CHUNK_CHARS, OVERLAP_CHARS, MIN_NOTES_LENGTH } from './constants';

export interface Chunk {
  text: string;
  index: number;
  type: 'title_summary' | 'transcript' | 'notes';
  startPos?: number;
  endPos?: number;
}

// Sentence-ending pattern: period/exclamation/question followed by whitespace
const SENTENCE_END = /(?<=[.!?])\s+/g;
// Clause boundary fallback: comma or semicolon followed by whitespace
const CLAUSE_END = /(?<=[,;])\s+/g;

/**
 * Split text into chunks at sentence boundaries, with overlap.
 * Each chunk is at most `maxChars` characters. Adjacent chunks
 * share `overlapChars` characters of trailing/leading context.
 */
function splitBySentenceBoundary(
  text: string,
  maxChars = MAX_CHUNK_CHARS,
  overlapChars = OVERLAP_CHARS,
): { text: string; startPos: number; endPos: number }[] {
  if (!text || text.length <= maxChars) {
    return text ? [{ text, startPos: 0, endPos: text.length }] : [];
  }

  // Split into sentences first
  const sentences = splitIntoSentences(text);
  const chunks: { text: string; startPos: number; endPos: number }[] = [];

  let currentChunk = '';
  let chunkStart = 0;
  let pos = 0;

  for (const sentence of sentences) {
    // If adding this sentence exceeds limit and we already have content, finalize chunk
    if (currentChunk.length + sentence.length > maxChars && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        startPos: chunkStart,
        endPos: pos,
      });

      // Start next chunk with overlap from the end of the current chunk
      const overlapStart = Math.max(0, currentChunk.length - overlapChars);
      const overlap = currentChunk.slice(overlapStart);
      chunkStart = pos - overlap.length;
      currentChunk = overlap;
    }

    // If a single sentence exceeds maxChars, split it at clause boundaries
    if (sentence.length > maxChars) {
      const subChunks = splitAtClauseBoundaries(sentence, maxChars);
      for (const sub of subChunks) {
        if (currentChunk.length + sub.length > maxChars && currentChunk.length > 0) {
          chunks.push({
            text: currentChunk.trim(),
            startPos: chunkStart,
            endPos: pos,
          });
          const overlapStart = Math.max(0, currentChunk.length - overlapChars);
          const overlap = currentChunk.slice(overlapStart);
          chunkStart = pos - overlap.length;
          currentChunk = overlap;
        }
        currentChunk += sub;
        pos += sub.length;
      }
    } else {
      currentChunk += sentence;
      pos += sentence.length;
    }
  }

  // Final chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      startPos: chunkStart,
      endPos: pos,
    });
  }

  return chunks;
}

/** Split text into sentences, preserving the delimiter with the preceding sentence. */
function splitIntoSentences(text: string): string[] {
  const parts = text.split(SENTENCE_END);
  if (parts.length <= 1) return [text];

  // Re-attach whitespace — split removes it, so add a space back
  return parts.map((part, i) => (i < parts.length - 1 ? part + ' ' : part));
}

/** Fallback: split at clause boundaries (, ;) when a sentence is too long. */
function splitAtClauseBoundaries(text: string, maxChars: number): string[] {
  const parts = text.split(CLAUSE_END);
  if (parts.length <= 1) {
    // Hard split as last resort
    return hardSplit(text, maxChars);
  }
  return parts.map((part, i) => (i < parts.length - 1 ? part + ' ' : part));
}

/** Hard split as absolute last resort — prefers word boundaries over mid-word cuts. */
function hardSplit(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    if (start + maxChars >= text.length) {
      chunks.push(text.slice(start));
      break;
    }

    // Find the last whitespace within the max range
    let end = start + maxChars;
    const lastSpace = text.lastIndexOf(' ', end);

    if (lastSpace > start) {
      end = lastSpace + 1; // Include the space in the current chunk
    }
    // else: no whitespace found (extremely long word) — hard cut at maxChars

    chunks.push(text.slice(start, end));
    start = end;
  }

  return chunks;
}

/**
 * Chunk a meeting into indexable segments.
 *
 * - Chunk 0: title + summary (high-level semantic anchor)
 * - Chunks 1..N: transcript segments (sentence-boundary split with overlap)
 * - Final chunk: user notes + action items (if present)
 */
export function chunkMeeting(item: HistoryItem): Chunk[] {
  const chunks: Chunk[] = [];

  // Always create a title+summary chunk as the semantic anchor
  const titleSummary = [item.title, item.summary || ''].filter(Boolean).join('. ');
  if (titleSummary.trim()) {
    chunks.push({
      text: titleSummary.trim(),
      index: 0,
      type: 'title_summary',
    });
  }

  // Split transcript into overlapping chunks
  if (item.transcript && item.transcript.trim().length > 0) {
    const transcriptChunks = splitBySentenceBoundary(item.transcript.trim());
    for (const tc of transcriptChunks) {
      chunks.push({
        text: tc.text,
        index: chunks.length,
        type: 'transcript',
        startPos: tc.startPos,
        endPos: tc.endPos,
      });
    }
  }

  // Notes and action items as a single chunk
  const noteTexts = (item.userNotes || []).map(n => n.text).filter(Boolean);
  const actionTexts = (item.userActionItems || []).map(a => a.text).filter(Boolean);
  const combinedNotes = [...noteTexts, ...actionTexts].join('. ');

  if (combinedNotes.length > MIN_NOTES_LENGTH) {
    chunks.push({
      text: combinedNotes,
      index: chunks.length,
      type: 'notes',
    });
  }

  return chunks;
}

/**
 * Compute a content hash for staleness detection.
 * Any change in title, summary, or transcript triggers re-indexing.
 */
export async function computeContentHash(item: HistoryItem): Promise<string> {
  const content = [
    item.title || '',
    item.summary || '',
    item.transcript || '',
    (item.userNotes || []).map(n => n.text).join('|'),
    (item.userActionItems || []).map(a => a.text).join('|'),
  ].join('\n');

  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
