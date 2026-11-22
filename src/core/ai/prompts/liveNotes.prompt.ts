/** Live AI notes: the meeting's running notes, written as it happens, with the user's own shorthand filled in; the shape is
 *  liveNotesSchema. */

import { SPEAKER_NAMING, TRANSCRIPT_GUIDE } from './transcript.prompt';
import { personalizationSections, type PromptPersonalization } from './personalization.prompt';

export interface LiveNotesInput {
  /** The user's lines, oldest first, under short ids ("n1"); `at` is the recording clock when typed ("12:38"), when known. */
  notes: Array<{ id: string; text: string; at?: string }>;
  /** The user's notes as filled in so far, by note id. */
  filled: Array<{ noteId: string; text: string }>;
  /** The newest points, and older ones whose talk came back, under their ids. */
  points: Array<{ id: string; text: string }>;
  /** Earlier talk the new or changed notes refer to, recalled from the whole meeting. */
  earlier: string[];
  /** The meeting's participants from the calendar, when it has an event. */
  participants: string[];
  /** The transcript since the last update, one labelled line per entry. */
  transcript: string;
}

const LIVE_NOTES = `You write live notes for a meeting while it happens. Every few seconds you get the transcript since your last update; turn it into clear notes the user can read at a glance. You also get the newest points and older ones the talk came back to, and earlier talk that relates to the user's notes.

## Points

- Add a point for each new thing said: a topic, a step in it, a decision, number, date or task. Sentences that say one thing make one point; never one point per sentence.
- The notes grow as the meeting goes: something new on a topic you already have is a new point, not a rewrite of the old one.
- Return a point under Points so far, with its id, only to correct it (the talk changed a name, number, date or decision). Never write a point you already have again as a new one.
- Return only new and changed points. If the new transcript is small talk or filler, return none.

## The user's notes

The user may type shorthand notes. They show what matters to them: fill in every note, by its id, from what was said about it, in the new transcript or under Earlier in the meeting, and give those topics more detail. If nothing relevant was said yet, write the note out clearly in their words. Return a note again only when its text changes. A topic a note covers belongs in the note, not in a separate point.

## Style

- One or two short sentences each: the point, then the specifics (names, numbers, dates exactly as said). Never put times or ids in the text.
- Use only the transcript and the notes. Write in the language of the meeting.

${TRANSCRIPT_GUIDE}

${SPEAKER_NAMING}`;

/** The live-notes instructions, with what the user set in Personalization. */
export function liveNotesPrompt(personalization: PromptPersonalization): string {
  return [LIVE_NOTES, personalizationSections(personalization, 'transcript')].filter(Boolean).join('\n\n');
}

const section = (title: string, lines: string[]) => `## ${title}\n\n${lines.length > 0 ? lines.join('\n') : '(none)'}`;

/** The user message for one update: the user's notes and how they stand, the points, earlier talk, then the new transcript. */
export function buildLiveNotesInput({ notes, filled, points, earlier, participants, transcript }: LiveNotesInput): string {
  return [
    ...(participants.length > 0 ? [section('Participants (from the calendar)', [participants.join(', ')])] : []),
    section('User notes', notes.map(({ id, text, at }) => `${id}: ${text}${at ? ` — typed at ${at}` : ''}`)),
    section('User notes filled in so far', filled.map(({ noteId, text }) => `${noteId}: ${text}`)),
    section('Points so far', points.map(({ id, text }) => `${id}: ${text}`)),
    section('Earlier in the meeting', earlier),
    section('New transcript', transcript ? [transcript] : []),
  ].join('\n\n');
}
