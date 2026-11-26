/** A meeting's notes: while recording, the user's shorthand alone; after, it and the summary's AI lines that fill it in, one view
 *  at a time behind a switch, where only the lines being written shimmer. */

import React, { useMemo, useState } from 'react';
import { AiLine, Icon, RociMark, Tabs, Text, Textarea } from '@shared/ui';
import { LIVE_NOTES_CONFIG as NOTES, type NotesView } from '@config/liveNotes.config';
import { aiRows, type Bullet } from './liveNotes';
import { useLiveNotesStore } from './liveNotesStore';

/** The summary's side of the notes, after the meeting. */
export interface AiNotesProps {
  /** Why the AI lines can't be written (no Summary model, a missing key), in words to show; null when they can. */
  modelProblem: string | null;
  /** The summary's AI lines, once written. */
  bullets: Bullet[];
  /** The summary is being written now: the notes still waiting shimmer. */
  writing: boolean;
}

/** What the notes pane shows: the user's lines, and after the meeting the summary's beside them (none while recording). */
export interface NotesPaneProps {
  onType: (text: string) => void;
  ai?: AiNotesProps;
  /** Opened to write a note (the meeting's + › Note): your notes show, with the caret in them. */
  focus?: boolean;
}

/** A pane's heading row: the title or a switch, then trailing content. */
// box-content: the row is one segmented control tall plus its padding, so a title and a switch sit on the same line
export const PaneHeader: React.FC<{ children: React.ReactNode; trailing?: React.ReactNode }> = ({ children, trailing }) => (
  <div className="box-content flex h-control-sm shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2">
    {children}
    {trailing}
  </div>
);

/** A pane's empty text, in the same style as the notes' placeholder so all panes read alike. */
export const EmptyLine: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text as="p" variant="reading" tone="faint">{children}</Text>
);

export const YourNotes: React.FC<{ onType: (text: string) => void; autoFocus: boolean }> = ({ onType, autoFocus }) => {
  const lines = useLiveNotesStore((s) => s.lines);
  const value = useMemo(() => lines.map((l) => l.text).join('\n'), [lines]);
  return (
    <Textarea
      variant="bare"
      autoFocus={autoFocus}
      value={value}
      onChange={(event) => onType(event.target.value)}
      placeholder={NOTES.copy.placeholder}
      aria-label={NOTES.copy.yourNotes}
      className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-4"
    />
  );
};

export const AiNotes: React.FC<AiNotesProps> = (props) => {
  const lines = useLiveNotesStore((s) => s.lines);
  const rows = useMemo(() => aiRows(lines, props.bullets), [lines, props.bullets]);
  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-4">
      {rows.length === 0 ? (
        <EmptyLine>{props.modelProblem ?? NOTES.copy.aiEmptyAfter}</EmptyLine>
      ) : (
        // rows carry their own inset; pulling them out by it lines their marks up with the pane's text
        <ul className="-mx-3 space-y-1">
          {rows.map((row) => row.kind === 'pending'
            // only the lines being written shimmer; the rest wait in the user's words
            ? <AiLine key={`pending-${row.line.id}`} state={props.writing ? 'writing' : 'waiting'}>{row.line.text.trim()}</AiLine>
            : <AiLine key={`${row.bullet.id}:${row.bullet.text}`} state="written">{row.bullet.text}</AiLine>)}
        </ul>
      )}
    </div>
  );
};

export const NOTES_TABS = [
  { value: 'ai' as const, label: <span className="inline-flex items-center gap-1"><Icon icon={RociMark} size="xs" tone="ai" />{NOTES.copy.aiNotes}</span>, text: NOTES.copy.aiNotes },
  { value: 'notes' as const, label: NOTES.copy.yourNotes },
];

/** Mac and iPad: while recording, Your notes alone (typing takes the focus); after, the AI summary (first, and open) or Your
 *  notes behind a switch. */
export const NotesPane: React.FC<NotesPaneProps> = ({ onType, ai, focus }) => {
  const [view, setView] = useState<NotesView>(focus ? 'notes' : 'ai');
  if (!ai) {
    return (
      <section className="flex h-full min-h-0 flex-col">
        <PaneHeader><Text variant="label" tone="muted">{NOTES.copy.yourNotes}</Text></PaneHeader>
        <YourNotes onType={onType} autoFocus />
      </section>
    );
  }
  return (
    <section className="flex h-full min-h-0 flex-col">
      <PaneHeader>
        <Tabs items={NOTES_TABS} value={view} onValueChange={setView} label={NOTES.copy.yourNotes} />
      </PaneHeader>
      {view === 'notes' ? <YourNotes onType={onType} autoFocus={!!focus} /> : <AiNotes {...ai} />}
    </section>
  );
};
