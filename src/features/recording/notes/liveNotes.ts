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

/** One enhanced note, updated in place by its id. */
export interface Bullet {
  id: string;
  /** The note line it expands. */
  noteId?: string;
  text: string;
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

/** How much speech the entries cover (ms). */
export const spokenMs = (entries: LiveEntry[]): number => entries.reduce((sum, e) => sum + Math.max(0, e.endMs - e.startMs), 0);

/** Why a refresh should run now, or null to skip: enough new transcript, or a typing pause after the notes or transcript changed. */
export function refreshReason(args: { unsent: LiveEntry[]; notesChanged: boolean; typingPaused: boolean }): 'transcript' | 'typing' | null {
  if (spokenMs(args.unsent) >= NOTES.transcriptStepMs) return 'transcript';
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

/** The model's changes applied in place: a note's line (by note) or a known extra (by id) is replaced where it stands, anything
 *  else is added (in note order for a note, else at the end). Lines of deleted notes go. */
export function mergeBullets(current: Bullet[], changes: LiveNotesChange[], lines: NoteLine[]): Bullet[] {
  const liveNotes = new Set(writtenLines(lines).map((l) => l.id));
  const nextId = nextIdFrom(current);
  const merged = current.filter((b) => !b.noteId || liveNotes.has(b.noteId));
  for (const change of changes) {
    const text = change.text.trim();
    if (!text) continue;
    const noteId = change.noteId && liveNotes.has(change.noteId) ? change.noteId : undefined;
    const at = noteId ? merged.findIndex((b) => b.noteId === noteId) : change.id ? merged.findIndex((b) => !b.noteId && b.id === change.id) : -1;
    if (at >= 0) merged[at] = { ...merged[at], text, noteId: noteId ?? merged[at].noteId };
    else merged.splice(insertionIndex(merged, noteId, lines), 0, { id: nextId(), noteId, text });
  }
  return merged;
}

/** Where a new bullet goes: before the first bullet of a later note, so bullets follow the order of the notes. */
function insertionIndex(bullets: Bullet[], noteId: string | undefined, lines: NoteLine[]): number {
  if (!noteId) return bullets.length;
  const order = new Map(writtenLines(lines).map((l, i) => [l.id, i]));
  const own = order.get(noteId) ?? 0;
  const later = bullets.findIndex((b) => b.noteId !== undefined && (order.get(b.noteId) ?? 0) > own);
  return later >= 0 ? later : bullets.length;
}

/** One row of the AI notes: a written bullet, or a typed line the model has not filled in yet. */
export type AiRow = { kind: 'bullet'; bullet: Bullet } | { kind: 'pending'; line: NoteLine };

/** The AI notes in the order of the typed lines: each line's bullets, or the line itself while it waits; bullets that expand no
 *  line come last. */
export function aiRows(lines: NoteLine[], bullets: Bullet[]): AiRow[] {
  const byNote = new Map<string, Bullet[]>();
  bullets.forEach((b) => b.noteId && byNote.set(b.noteId, [...(byNote.get(b.noteId) ?? []), b]));
  const rows = writtenLines(lines).flatMap((line): AiRow[] => {
    const own = byNote.get(line.id);
    return own ? own.map((bullet) => ({ kind: 'bullet', bullet })) : [{ kind: 'pending', line }];
  });
  const free = bullets.filter((b) => !b.noteId).map((bullet): AiRow => ({ kind: 'bullet', bullet }));
  return [...rows, ...free];
}

/** One refresh's request: the notes under short ids ("n1", in order) the model can copy exactly, and the way back to real ids. */
export function liveNotesRequest(lines: NoteLine[], bullets: Bullet[], transcript: string, clock: (ms: number) => string): {
  input: LiveNotesInput;
  realId: Map<string, string>;
} {
  const written = writtenLines(lines);
  const shortId = new Map(written.map((line, i) => [line.id, `n${i + 1}`]));
  const input: LiveNotesInput = {
    notes: written.map((l) => ({ id: shortId.get(l.id) ?? l.id, text: l.text.trim(), at: l.atMs === undefined ? undefined : clock(l.atMs) })),
    filled: bullets.flatMap((b) => (b.noteId && shortId.has(b.noteId) ? [{ noteId: shortId.get(b.noteId) ?? b.noteId, text: b.text }] : [])),
    extras: bullets.filter((b) => !b.noteId).map((b) => ({ id: b.id, text: b.text })),
    transcript,
  };
  return { input, realId: new Map([...shortId].map(([real, short]) => [short, real])) };
}

/** The model's reply as changes on real ids; a filled note naming no known note is dropped. */
export function changesFromReply(reply: { filled?: LiveNotesChange[]; extras?: LiveNotesChange[] }, realId: Map<string, string>): LiveNotesChange[] {
  const filled = (reply.filled ?? []).flatMap((c) => {
    const noteId = c.noteId && realId.get(c.noteId);
    return noteId ? [{ noteId, text: c.text }] : [];
  });
  const extras = (reply.extras ?? []).map((c) => ({ id: c.id, text: c.text }));
  return [...filled, ...extras];
}
