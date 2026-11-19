/** Live enhanced notes, the pure parts: typed lines with the time each was typed, the bullets merged in place, and when to refresh. */

import { LIVE_NOTES_CONFIG as NOTES } from '@config/liveNotes.config';
import { MEETING_LIVE_CONFIG as LIVE } from '@config/meetingLive.config';
import type { LiveNotesChange } from '@core/ai/schemas/liveNotes.schema';
import type { LiveNotesInput } from '@core/ai/prompts/liveNotes.prompt';
import type { LiveEntry } from '@features/recording/live/liveTranscript';

/** One line of the user's notes; its id is the saved note's id. */
export interface NoteLine {
  id: string;
  text: string;
  /** The recording clock when the line got its first words (ms); unknown for lines from before this screen opened. */
  atMs?: number;
  /** Wall-clock time of the same moment (epoch ms), saved as the note's creation time. */
  typedAt?: number;
}

/** One line of the AI notes, updated in place: a typed note filled in (`noteId`), or a point of the meeting. */
export interface Bullet {
  id: string;
  /** The note line it fills in. */
  noteId?: string;
  text: string;
  /** Its place on the recording clock (ms): when its note was typed, or when the talk it came from arrived. */
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

/** What the lines say, for "did the notes change since the last refresh". */
export const signatureOf = (lines: NoteLine[]): string => writtenLines(lines).map((l) => `${l.id}:${l.text.trim()}`).join('\n');

/** An entry's identity across store updates (sources are transcribed apart, so arrival order is not time order). */
export const entryKey = (entry: LiveEntry): string => `${entry.source}-${entry.startMs}`;

/** Entries not yet sent to a refresh. */
export const unsentEntries = (entries: LiveEntry[], sent: ReadonlySet<string>): LiveEntry[] => entries.filter((e) => !sent.has(entryKey(e)));

/** Why an update should run now, or null to skip: the meeting has moved on a step since the transcript the last update covered
 *  (time, pauses included), or a typing pause after the notes or transcript changed. */
export function refreshReason(args: { unsent: LiveEntry[]; coveredUntilMs: number; notesChanged: boolean; typingPaused: boolean }): 'transcript' | 'typing' | null {
  const newestMs = Math.max(args.coveredUntilMs, ...args.unsent.map((e) => e.endMs));
  if (newestMs - args.coveredUntilMs >= NOTES.transcriptStepMs) return 'transcript';
  if (args.typingPaused && (args.notesChanged || args.unsent.length > 0)) return 'typing';
  return null;
}

/** The new transcript as the model reads it: one line per entry, time order, labelled by who spoke. */
export function transcriptText(entries: LiveEntry[], clock: (ms: number) => string): string {
  return [...entries]
    .sort((a, b) => a.startMs - b.startMs)
    .map((e) => `${e.timed ? `[${clock(e.startMs)}] ` : ''}${LIVE.speakers[e.source]}: ${e.text}`)
    .join('\n');
}

/** The next free bullet id after the ones in use ("b4" after "b3"). */
function nextIdFrom(bullets: Bullet[]): () => string {
  let n = bullets.reduce((max, b) => Math.max(max, Number(b.id.slice(NOTES.bulletIdPrefix.length)) || 0), 0);
  return () => `${NOTES.bulletIdPrefix}${++n}`;
}

/** A new line's place on the recording clock: a note's line where the note was typed, a meeting point when its talk arrived. */
function newBullet(id: string, noteId: string | undefined, text: string, lines: NoteLine[], atMs: number): Bullet {
  const typed = noteId ? lines.find((l) => l.id === noteId)?.atMs : undefined;
  return { id, noteId, text, atMs: typed ?? atMs };
}

/** The model's changes applied in place: a note's line (by note) or a known point (by id) is replaced where it stands; anything
 *  else is added at `atMs` (a note's line at the note's time). Lines of deleted notes go. */
export function mergeBullets(current: Bullet[], changes: LiveNotesChange[], lines: NoteLine[], atMs: number): Bullet[] {
  const liveNotes = new Set(writtenLines(lines).map((l) => l.id));
  const nextId = nextIdFrom(current);
  const merged = current.filter((b) => !b.noteId || liveNotes.has(b.noteId));
  for (const change of changes) {
    const text = change.text.trim();
    if (!text) continue;
    const noteId = change.noteId && liveNotes.has(change.noteId) ? change.noteId : undefined;
    const at = noteId ? merged.findIndex((b) => b.noteId === noteId) : change.id ? merged.findIndex((b) => !b.noteId && b.id === change.id) : -1;
    if (at >= 0) merged[at] = { ...merged[at], text };
    else merged.push(newBullet(nextId(), noteId, text, lines, atMs));
  }
  return merged;
}

/** The summary's enhanced notes as AI lines: one per written note, in order, filling that note in (the summary returns them in
 *  the notes' order). */
export function enhancedBullets(lines: NoteLine[], enhanced: string[]): Bullet[] {
  return writtenLines(lines).flatMap((line, i) => {
    const text = enhanced[i]?.trim();
    return text ? [{ id: `${NOTES.bulletIdPrefix}${i + 1}`, noteId: line.id, text, atMs: line.atMs }] : [];
  });
}

/** One row of the AI notes: a written line, or a typed note the model has not filled in yet. */
export type AiRow = { kind: 'bullet'; bullet: Bullet } | { kind: 'pending'; line: NoteLine };

const rowTime = (row: AiRow): number => (row.kind === 'bullet' ? row.bullet.atMs : row.line.atMs) ?? 0;

/** The AI notes in time order: the meeting's points as their talk arrived, each typed note's line where it was typed (the note
 *  itself while it waits). */
export function aiRows(lines: NoteLine[], bullets: Bullet[]): AiRow[] {
  const filled = new Set(bullets.flatMap((b) => (b.noteId ? [b.noteId] : [])));
  const waiting = writtenLines(lines).filter((l) => !filled.has(l.id)).map((line): AiRow => ({ kind: 'pending', line }));
  const written = bullets.map((bullet): AiRow => ({ kind: 'bullet', bullet }));
  return [...written, ...waiting].sort((a, b) => rowTime(a) - rowTime(b));
}

/** A stretch of the meeting on the recording clock. */
export interface Span {
  startMs: number;
  endMs: number;
}

/** What an update recalled of the meeting so far: earlier talk for the changed notes, and when every recalled stretch was said. */
export interface Recall {
  passages: string[];
  spans: Span[];
}

export const NO_RECALL: Recall = { passages: [], spans: [] };

/** The notes the model hasn't seen as they are now (new or edited since the last applied update): they ask for earlier talk. */
export function changedNotes(lines: NoteLine[], seen: ReadonlyMap<string, string>): string[] {
  return writtenLines(lines).flatMap((l) => (seen.get(l.id) === l.text.trim() ? [] : [l.text.trim()]));
}

/** The notes as an applied update saw them, by id. */
export const notesSeen = (lines: NoteLine[]): Map<string, string> => new Map(writtenLines(lines).map((l) => [l.id, l.text.trim()]));

/** A search's hits as a recall: the notes' passages once each, most related first, within the budget; the time of every hit
 *  that is one of this recording's stretches (`spans`, by text). */
export function recallOf(noteHits: string[][], allHits: string[], spans: ReadonlyMap<string, Span>): Recall {
  let room = NOTES.recall.earlierChars;
  const passages = [...new Set(noteHits.flat())].filter((text) => spans.has(text) && (room -= text.length) >= 0);
  return { passages, spans: allHits.flatMap((text) => spans.get(text) ?? []) };
}

/** The points an update sends: the newest few, and older ones whose talk was recalled (a topic coming back). */
function pointsToSend(bullets: Bullet[], spans: Span[]): Bullet[] {
  const points = bullets.filter((b) => !b.noteId);
  const recent = new Set(points.slice(-NOTES.recall.recentPoints));
  const recalled = ({ atMs }: Bullet) => atMs !== undefined && spans.some((s) => atMs >= s.startMs && atMs <= s.endMs);
  return points.filter((b) => recent.has(b) || recalled(b));
}

/** One refresh's request: the notes under short ids ("n1", in order) the model can copy exactly, what was recalled, and the
 *  way back to real ids. */
export function liveNotesRequest(lines: NoteLine[], bullets: Bullet[], transcript: string, recall: Recall, clock: (ms: number) => string): {
  input: LiveNotesInput;
  realId: Map<string, string>;
} {
  const written = writtenLines(lines);
  const shortId = new Map(written.map((line, i) => [line.id, `n${i + 1}`]));
  const input: LiveNotesInput = {
    notes: written.map((l) => ({ id: shortId.get(l.id) ?? l.id, text: l.text.trim(), at: l.atMs === undefined ? undefined : clock(l.atMs) })),
    filled: bullets.flatMap((b) => (b.noteId && shortId.has(b.noteId) ? [{ noteId: shortId.get(b.noteId) ?? b.noteId, text: b.text }] : [])),
    points: pointsToSend(bullets, recall.spans).map((b) => ({ id: b.id, text: b.text })),
    earlier: recall.passages,
    transcript,
  };
  return { input, realId: new Map([...shortId].map(([real, short]) => [short, real])) };
}

/** The model's reply as changes on real ids; a filled note naming no known note is dropped. */
export function changesFromReply(reply: { filled?: LiveNotesChange[]; points?: LiveNotesChange[] }, realId: Map<string, string>): LiveNotesChange[] {
  const filled = (reply.filled ?? []).flatMap((c) => {
    const noteId = c.noteId && realId.get(c.noteId);
    return noteId ? [{ noteId, text: c.text }] : [];
  });
  const points = (reply.points ?? []).map((c) => ({ id: c.id, text: c.text }));
  return [...filled, ...points];
}
