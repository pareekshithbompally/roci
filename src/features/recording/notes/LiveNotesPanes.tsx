/** The record screen's notes: the user's shorthand and the AI notes the Summary model fills in, one view at a time behind a
 *  switch; one continuous list where only the lines a running refresh is writing shimmer. */

import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AiLine, Icon, RociMark, Tabs, Text, Textarea } from '@shared/ui';
import { LIVE_NOTES_CONFIG as NOTES, type NotesView } from '@config/liveNotes.config';
import { aiRows } from './liveNotes';
import { useLiveNotesStore } from './liveNotesStore';

/** A pane's heading row: the title or a switch, then trailing status. */
// box-content: the row is one segmented control tall plus its padding, so a title and a switch sit on the same line
export const PaneHeader: React.FC<{ children: React.ReactNode; trailing?: React.ReactNode }> = ({ children, trailing }) => (
  <div className="box-content flex h-control-sm shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2">
    {children}
    {trailing}
  </div>
);

/** A pane's empty text, in the same style as the notes' placeholder so all three panes read alike. */
export const EmptyLine: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text as="p" variant="reading" tone="faint">{children}</Text>
);

/** "Enhancing your notes…" with a copper spinner, while a refresh is in flight. */
export const EnhancingStatus: React.FC = () => {
  const updating = useLiveNotesStore((s) => s.updating);
  if (!updating) return null;
  return (
    <span role="status" className="flex min-w-0 items-center gap-1.5">
      <Icon icon={Loader2} size="xs" tone="ai" className="shrink-0 animate-spin motion-reduce:animate-none" />
      <Text variant="caption" shimmer truncate>{NOTES.copy.enhancing}</Text>
    </span>
  );
};

export const YourNotes: React.FC<{ onType: (text: string) => void }> = ({ onType }) => {
  const lines = useLiveNotesStore((s) => s.lines);
  const value = useMemo(() => lines.map((l) => l.text).join('\n'), [lines]);
  return (
    <Textarea
      variant="bare"
      autoFocus
      value={value}
      onChange={(event) => onType(event.target.value)}
      placeholder={NOTES.copy.placeholder}
      aria-label={NOTES.copy.yourNotes}
      className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-4"
    />
  );
};

export const AiNotes: React.FC<{ hasModel: boolean }> = ({ hasModel }) => {
  const lines = useLiveNotesStore((s) => s.lines);
  const bullets = useLiveNotesStore((s) => s.bullets);
  const updating = useLiveNotesStore((s) => s.updating);
  const rows = useMemo(() => aiRows(lines, bullets), [lines, bullets]);
  const empty = !hasModel ? NOTES.copy.noModel : rows.length === 0 ? NOTES.copy.aiEmpty : null;
  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-4">
      {empty ? (
        <EmptyLine>{empty}</EmptyLine>
      ) : (
        // rows carry their own inset; pulling them out by it lines their marks up with the pane's text
        <ul className="-mx-3 space-y-1">
          {rows.map((row) => row.kind === 'pending'
            // only the lines the running refresh is writing shimmer; the rest wait in the user's words
            ? <AiLine key={`pending-${row.line.id}`} state={updating ? 'writing' : 'waiting'}>{row.line.text.trim()}</AiLine>
            : <AiLine key={`${row.bullet.id}:${row.bullet.text}`} state="written">{row.bullet.text}</AiLine>)}
        </ul>
      )}
    </div>
  );
};

const VIEW_TABS = [
  { value: 'notes' as const, label: NOTES.copy.yourNotes },
  { value: 'ai' as const, label: <span className="inline-flex items-center gap-1"><Icon icon={RociMark} size="xs" tone="ai" />{NOTES.copy.aiNotes}</span>, text: NOTES.copy.aiNotes },
];

/** Mac and iPad: the notes pane, Your notes or AI notes behind a switch, the status beside it. */
export const NotesPane: React.FC<{ onType: (text: string) => void; hasModel: boolean }> = ({ onType, hasModel }) => {
  const [view, setView] = useState<NotesView>('notes');
  return (
    <section className="flex h-full min-h-0 flex-col">
      <PaneHeader trailing={<EnhancingStatus />}>
        <Tabs items={VIEW_TABS} value={view} onValueChange={setView} label={NOTES.copy.yourNotes} />
      </PaneHeader>
      {view === 'notes' ? <YourNotes onType={onType} /> : <AiNotes hasModel={hasModel} />}
    </section>
  );
};
