/** One-way meeting → Apple Notes sync, updating the same note on resave; logs and never throws. */

import { store } from '@services/db';
import { INTEGRATIONS_CONFIG } from '@config/integrations.config';
import { appleNotesService } from './appleNotes.service';
import type { MeetingDetail } from '@shared/types';

interface SyncTarget {
  enabled: boolean;
  /** Epoch ms the integration was turned on; older meetings aren't sent. */
  since?: number;
}

const COPY = INTEGRATIONS_CONFIG.appleNotes;
let target: SyncTarget = { enabled: false };

const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const list = (heading: string, items: string[] | undefined): string =>
  items && items.length > 0 ? `<h3>${heading}</h3><ul>${items.map((i) => `<li>${escape(i)}</li>`).join('')}</ul>` : '';

export const noteTag = (meetingId: string): string => `${COPY.tagPrefix} ${meetingId}`;

/** The note body: title, date, summary sections, transcript, then the tag line. */
export function noteHtml(meetingId: string, meeting: MeetingDetail): string {
  const { index, summary, transcript } = meeting;
  const date = new Date(index.createdAt).toLocaleString();
  const lines = transcript?.segments?.length
    ? transcript.segments.map((s) => (s.speaker ? `<b>${escape(s.speaker)}:</b> ${escape(s.text)}` : escape(s.text)))
    : (transcript?.text ?? '').split('\n').filter(Boolean).map(escape);
  return [
    `<h1>${escape(index.title)}</h1>`,
    `<div>${escape(date)}</div>`,
    summary?.overview ? `<h2>Summary</h2><p>${escape(summary.overview)}</p>` : '',
    list('Key points', summary?.keyDiscussionPoints),
    list('Decisions', summary?.decisionsMade),
    list('Action items', summary?.actionItems.map((a) => a.text)),
    list('Next steps', summary?.nextSteps),
    lines.length > 0 ? `<h2>Transcript</h2>${lines.map((l) => `<div>${l}</div>`).join('')}` : '',
    `<div><small>${escape(noteTag(meetingId))}</small></div>`,
  ].join('');
}

export const appleNotesSync = {
  /** Where and from when to sync; set by the Apple Notes runtime whenever settings change. */
  configure(next: SyncTarget): void {
    target = next;
  },

  /** A saved meeting → its note (created or updated). */
  async meetingSaved(meetingId: string): Promise<void> {
    if (!target.enabled) return;
    try {
      // The plugin starts Notes and checks consent itself (a refusal arrives as `not-authorized`).
      const meeting = await store.meetings.get(meetingId);
      if (!meeting || (target.since && new Date(meeting.index.createdAt).getTime() < target.since)) return;
      await appleNotesService.upsert({
        folder: COPY.folder,
        tag: noteTag(meetingId),
        title: meeting.index.title,
        html: noteHtml(meetingId, meeting),
      });
    } catch (error: unknown) {
      console.error('[appleNotesSync] Saving the note failed:', error);
    }
  },
};
