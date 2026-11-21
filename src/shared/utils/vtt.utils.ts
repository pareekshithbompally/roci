/** WebVTT parser: timestamps, speaker names (cue settings or voice tags), and transcript text. */

import { formatClock } from '@shared/utils/formatters';

export interface VTTParsedSegment {
  timestamp: string;
  speaker?: string;
  text: string;
}

export interface VTTParseResult {
  segments: VTTParsedSegment[];
  fullText: string;
  speakers: string[];
}

export function parseVTT(vttContent: string): VTTParseResult {
  const segments: VTTParsedSegment[] = [];
  const speakersSet = new Set<string>();

  // Split by double newlines to get cue blocks
  const blocks = vttContent.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');

    // Skip WEBVTT header and NOTE blocks
    if (lines[0].startsWith('WEBVTT') || lines[0].startsWith('NOTE')) {
      continue;
    }

    // Find timestamp line (format: 00:00:00.000 --> 00:00:05.000)
    const timestampLineIndex = lines.findIndex(line => line.includes('-->'));

    if (timestampLineIndex === -1) continue;

    const timestampLine = lines[timestampLineIndex];
    const timestampMatch = timestampLine.match(/^([\d:\.]+)\s+-->\s+([\d:\.]+)/);

    if (!timestampMatch) continue;

    const startTime = formatTimestamp(timestampMatch[1]);

    // Extract speaker from cue settings or voice tags
    let speaker: string | undefined;

    // Check for voice tag in cue settings (e.g., <v Speaker Name>)
    const voiceMatch = timestampLine.match(/<v\s+([^>]+)>/i);
    if (voiceMatch) {
      speaker = voiceMatch[1].trim();
      speakersSet.add(speaker);
    }

    // Get text lines (everything after timestamp line)
    const textLines = lines.slice(timestampLineIndex + 1);
    let text = textLines.join(' ').trim();

    // Check for voice tag in text content
    if (!speaker) {
      const textVoiceMatch = text.match(/<v\s+([^>]+)>(.*)/i);
      if (textVoiceMatch) {
        speaker = textVoiceMatch[1].trim();
        text = textVoiceMatch[2].trim();
        speakersSet.add(speaker);
      }
    }

    // Remove any remaining HTML-like tags
    text = text.replace(/<\/?[^>]+(>|$)/g, '').trim();

    if (text) {
      segments.push({
        timestamp: startTime,
        speaker,
        text
      });
    }
  }

  // Build full text with timestamps and optional speakers
  const fullText = segments.map(seg => {
    const speakerPrefix = seg.speaker ? `[${seg.speaker}] ` : '';
    return `[${seg.timestamp}] ${speakerPrefix}${seg.text}`;
  }).join('\n\n');

  return {
    segments,
    fullText,
    speakers: Array.from(speakersSet)
  };
}

/** VTT timestamp (HH:MM:SS.mmm or MM:SS.mmm) as the clock (MM:SS); anything else as it is. */
function formatTimestamp(timestamp: string): string {
  const parts = timestamp.split(':').map(parseFloat);
  if (parts.length < 2 || parts.length > 3 || parts.some(Number.isNaN)) return timestamp;
  return formatClock(parts.reduce((total, part) => total * 60 + part, 0));
}
