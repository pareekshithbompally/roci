/** SRT/VTT to plain text: strips timecodes, cue ids, HTML tags, headers, STYLE/NOTE blocks and positioning. */

/** Timestamp patterns for SRT and VTT */
const TIMESTAMP_LINE = /^\d{2}:\d{2}[:.]\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}[:.]\d{2}[.,]\d{3}/;

/** Numeric cue identifier (SRT) */
const CUE_ID = /^\d+$/;

/** HTML-like tags */
const HTML_TAGS = /<\/?[^>]+>/g;

/** VTT cue settings (position, align, etc.) after timestamp */
const CUE_SETTINGS = /\s+(position|align|line|size|vertical|region|snap):[^\s]+/g;

/** Parse a subtitle file into plain text, keeping line breaks between cues. */
export function parseSubtitleFile(content: string, format: 'srt' | 'vtt'): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const textLines: string[] = [];
  let inStyleBlock = false;
  let inNoteBlock = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip empty lines (they separate cues)
    if (!line) {
      inNoteBlock = false;
      continue;
    }

    // VTT: skip header
    if (format === 'vtt' && /^WEBVTT/i.test(line)) continue;

    // VTT: skip STYLE blocks
    if (/^STYLE$/i.test(line)) {
      inStyleBlock = true;
      continue;
    }
    if (inStyleBlock) {
      if (line === '') inStyleBlock = false;
      continue;
    }

    // VTT: skip NOTE blocks
    if (/^NOTE/i.test(line)) {
      inNoteBlock = true;
      continue;
    }
    if (inNoteBlock) continue;

    // Skip timestamp lines
    if (TIMESTAMP_LINE.test(line)) continue;

    // Skip numeric cue identifiers
    if (CUE_ID.test(line)) continue;

    // Clean text: strip HTML tags and cue settings
    let clean = line
      .replace(HTML_TAGS, '')
      .replace(CUE_SETTINGS, '')
      .trim();

    if (clean) {
      textLines.push(clean);
    }
  }

  return textLines.join('\n');
}
