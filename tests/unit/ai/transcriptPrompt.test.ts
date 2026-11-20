import { describe, it, expect } from 'vitest';
import { MEETING_LIVE_CONFIG } from '@config/meetingLive.config';
import {
  buildChatSystemPrompt,
  buildTranscriptionPrompt,
  LIVE_NOTES_PROMPT,
  NO_TOOLS,
  SPEAKERS,
  SPEAKER_NAMING,
  TRANSCRIPT_GUIDE,
  buildLiveNotesInput,
} from '@core/ai/prompts';

const summary = (participants: Array<{ name?: string; email?: string }> = []) =>
  buildTranscriptionPrompt({
    categories: [],
    temporalContext: 'Current date: 2026-11-20 (Friday).',
    schema: { properties: {} },
    meetingContext: { title: 'Weekly sync', participants },
  });

describe('transcript guide', () => {
  it('names the labels the app writes into transcripts, from their one config', () => {
    expect(SPEAKERS).toEqual({ self: MEETING_LIVE_CONFIG.speakers.microphone, others: MEETING_LIVE_CONFIG.speakers.system });
    expect(TRANSCRIPT_GUIDE).toContain(`"${SPEAKERS.self}" is the user, who recorded the meeting.`);
    expect(TRANSCRIPT_GUIDE).toContain(`"${SPEAKERS.others}" is everyone else on the call, not one person.`);
    expect(TRANSCRIPT_GUIDE).toContain('[…] marks a stretch left out');
  });

  it('names speakers from what the transcript shows, or the calendar participants listed once with the meeting', () => {
    expect(SPEAKER_NAMING).toContain('only when the transcript shows who they are');
    expect(SPEAKER_NAMING).toContain('participants from the calendar are listed');
  });

  it('is the same text in the summary, live notes, and chat with meeting tools', () => {
    expect(summary()).toContain(TRANSCRIPT_GUIDE);
    expect(LIVE_NOTES_PROMPT).toContain(TRANSCRIPT_GUIDE);
    expect(summary()).toContain(SPEAKER_NAMING);
    expect(LIVE_NOTES_PROMPT).toContain(SPEAKER_NAMING);
    const chat = (meetings: boolean) => buildChatSystemPrompt({
      tools: { ...NO_TOOLS, meetings }, modalities: { input: ['text'], output: ['text'] }, meetingCount: 1, timeContext: '',
    });
    expect(chat(true)).toContain(TRANSCRIPT_GUIDE);
    expect(chat(false)).not.toContain(TRANSCRIPT_GUIDE);
  });

  it('summary: the user\'s own tasks are theirs; participants are listed once, under Meeting details', () => {
    const text = summary([{ name: 'Priya', email: 'p@x.com' }, { email: 'only@x.com' }]);
    expect(text).toContain(`A task ${SPEAKERS.self} took on has the owner "${SPEAKERS.self}".`);
    expect(text.match(/Priya \(p@x\.com\)/g)).toHaveLength(1);
    expect(text).not.toContain('The calendar lists');
  });

  it('live notes list the calendar participants with the update, only when there are some', () => {
    const input = { notes: [], filled: [], points: [], earlier: [], transcript: '' };
    expect(buildLiveNotesInput({ ...input, participants: ['Priya', 'Raj'] })).toContain('## Participants (from the calendar)\n\nPriya, Raj');
    expect(buildLiveNotesInput({ ...input, participants: [] })).not.toContain('Participants');
  });
});
