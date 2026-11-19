/** A meeting's notes: the user's shorthand and the AI lines that fill it in, one view at a time behind a switch; one continuous
 *  list where only the lines being written shimmer. The same pane while recording and after. */

import React, { useMemo, useState } from 'react';
import { AiLine, Icon, RociMark, Tabs, Text, Textarea } from '@shared/ui';
import { LIVE_NOTES_CONFIG as NOTES, type NotesView } from '@config/liveNotes.config';
import { aiRows, type Bullet } from './liveNotes';
import { useLiveNotesStore } from './liveNotesStore';

/** What the notes pane shows besides the user's lines. */
export interface NotesPaneProps {
  onType: (text: string) => void;
  hasModel: boolean;
  /** The AI lines: live ones while recording, the summary's once written. */
  bullets: Bullet[];
  /** AI lines are being written now (a live refresh, or the summary): the notes still waiting shimmer. */
  writing: boolean;
  /** The meeting is recording: the empty AI view says lines build as it goes, and typing takes the focus. */
  live: boolean;
  initialView: NotesView;
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

type AiNotesProps = Pick<NotesPaneProps, 'hasModel' | 'bullets' | 'writing' | 'live'>;

function aiEmptyCopy({ hasModel, live }: AiNotesProps): string {
  if (!hasModel) return NOTES.copy.noModel;
  return live ? NOTES.copy.aiEmpty : NOTES.copy.aiEmptyAfter;
}

export const AiNotes: React.FC<AiNotesProps> = (props) => {
  const lines = useLiveNotesStore((s) => s.lines);
  const rows = useMemo(() => aiRows(lines, props.bullets), [lines, props.bullets]);
  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-4">
      {rows.length === 0 ? (
        <EmptyLine>{aiEmptyCopy(props)}</EmptyLine>
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
  { value: 'notes' as const, label: NOTES.copy.yourNotes },
  { value: 'ai' as const, label: <span className="inline-flex items-center gap-1"><Icon icon={RociMark} size="xs" tone="ai" />{NOTES.copy.aiNotes}</span>, text: NOTES.copy.aiNotes },
];

/** Mac and iPad: the notes pane, Your notes or AI notes behind a switch. */
export const NotesPane: React.FC<NotesPaneProps> = ({ onType, initialView, ...ai }) => {
  const [view, setView] = useState<NotesView>(initialView);
  return (
    <section className="flex h-full min-h-0 flex-col">
      <PaneHeader>
        <Tabs items={NOTES_TABS} value={view} onValueChange={setView} label={NOTES.copy.yourNotes} />
      </PaneHeader>
      {view === 'notes' ? <YourNotes onType={onType} autoFocus={ai.live} /> : <AiNotes {...ai} />}
    </section>
  );
};
