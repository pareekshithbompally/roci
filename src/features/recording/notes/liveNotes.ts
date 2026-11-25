/** A meeting's notes, the pure parts: typed lines with the time each was typed, and the summary's AI lines beside them. */

import { LIVE_NOTES_CONFIG as NOTES } from '@config/liveNotes.config';

/** One line of the user's notes; its id is the saved note's id. */
export interface NoteLine {
  id: string;
  text: string;
  /** The recording clock when the line got its first words (ms); unknown for lines from before this screen opened. */
  atMs?: number;
  /** Wall-clock time of the same moment (epoch ms), saved as the note's creation time. */
  typedAt?: number;
}

/** One line of the summary's AI notes: a typed note filled in (`noteId`), or a point of the meeting. */
export interface Bullet {
  id: string;
  /** The note line it fills in. */
  noteId?: string;
  text: string;
  /** Its place on the recording clock (ms): when its note was typed. */
  atMs?: number;
}

/** When a line is typed: the recording clock and the wall clock. */
export interface TypedAt {
  atMs: number;
  typedAt: number;
}

const isBlank = (text: string) => text.trim().length === 0;

/** A changed line keeps its id; it takes the time it is typed at when it had no words yet. */
function editLine(line: NoteLine, text: string, now: TypedAt): NoteLine {
  return isBlank(line.text) && !isBlank(text) ? { ...line, text, ...now } : { ...line, text };
}

function newLine(text: string, now: TypedAt, newId: () => string): NoteLine {
  return isBlank(text) ? { id: newId(), text } : { id: newId(), text, ...now };
}

/** The lines after an edit of the whole text: unchanged lines at either end keep their ids and times, and the edited middle
 *  is paired line by line, so inserting a line between two others gives only that line a new id and time. */
export function reconcileLines(previous: NoteLine[], text: string, now: TypedAt, newId: () => string = () => crypto.randomUUID()): NoteLine[] {
  const next = text.split('\n');
  let head = 0;
  while (head < previous.length && head < next.length && previous[head].text === next[head]) head++;
  let tail = 0;
  while (
    tail < previous.length - head && tail < next.length - head &&
    previous[previous.length - 1 - tail].text === next[next.length - 1 - tail]
  ) tail++;
  const oldMiddle = previous.slice(head, previous.length - tail);
  const newMiddle = next.slice(head, next.length - tail).map((line, i) =>
    i < oldMiddle.length ? editLine(oldMiddle[i], line, now) : newLine(line, now, newId));
  return [...previous.slice(0, head), ...newMiddle, ...previous.slice(previous.length - tail)];
}

/** The lines worth saving and sending: those with words. */
export const writtenLines = (lines: NoteLine[]): NoteLine[] => lines.filter((line) => !isBlank(line.text));

/** The summary's enhanced notes as AI lines: one per written note, in order, filling that note in (the summary returns them in
 *  the notes' order). */
export function enhancedBullets(lines: NoteLine[], enhanced: string[]): Bullet[] {
  return writtenLines(lines).flatMap((line, i) => {
    const text = enhanced[i]?.trim();
    return text ? [{ id: `${NOTES.bulletIdPrefix}${i + 1}`, noteId: line.id, text, atMs: line.atMs }] : [];
  });
}

/** The written summary's AI lines: each typed note filled in, then the meeting's key points (no clock time: they follow). */
export function summaryBullets(lines: NoteLine[], enhanced: string[], points: string[]): Bullet[] {
  return [...enhancedBullets(lines, enhanced), ...points.map((text, i) => ({ id: `point-${i + 1}`, text }))];
}

/** One row of the AI notes: a written line, or a typed note the model has not filled in yet. */
export type AiRow = { kind: 'bullet'; bullet: Bullet } | { kind: 'pending'; line: NoteLine };

/** A line's place: its clock time; a summary point (no time) after every timed line. */
const rowTime = (row: AiRow): number => (row.kind === 'bullet' ? row.bullet.atMs ?? Number.MAX_SAFE_INTEGER : row.line.atMs ?? 0);

/** The AI notes in time order: each typed note's line where it was typed (the note itself while it waits), then the summary's
 *  key points. */
export function aiRows(lines: NoteLine[], bullets: Bullet[]): AiRow[] {
  const filled = new Set(bullets.flatMap((b) => (b.noteId ? [b.noteId] : [])));
  const waiting = writtenLines(lines).filter((l) => !filled.has(l.id)).map((line): AiRow => ({ kind: 'pending', line }));
  const written = bullets.map((bullet): AiRow => ({ kind: 'bullet', bullet }));
  return [...written, ...waiting].sort((a, b) => rowTime(a) - rowTime(b));
}
