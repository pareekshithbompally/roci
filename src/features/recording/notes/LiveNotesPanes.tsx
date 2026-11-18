/** The record screen's notes: the user's shorthand and the AI notes the Summary model fills in, one view at a time behind a
 *  switch; a line still being filled in shimmers in copper until its bullet lands. */

import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AiArrived, AiPending, Icon, RociMark, Tabs, Text, Textarea } from '@shared/ui';
import { LIVE_NOTES_CONFIG as NOTES, type NotesView } from '@config/liveNotes.config';
import { aiRows } from './liveNotes';
import { useLiveNotesStore } from './liveNotesStore';

/** A pane's heading row: the title or a switch, then trailing status. */
export const PaneHeader: React.FC<{ children: React.ReactNode; trailing?: React.ReactNode }> = ({ children, trailing }) => (
  <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2">
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
  const rows = useMemo(() => aiRows(lines, bullets), [lines, bullets]);
  const empty = !hasModel ? NOTES.copy.noModel : rows.length === 0 ? NOTES.copy.aiEmpty : null;
  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-4">
      {empty ? (
        <EmptyLine>{empty}</EmptyLine>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => row.kind === 'pending' ? (
            <li key={`pending-${row.line.id}`}><AiPending>{row.line.text.trim()}</AiPending></li>
          ) : (
            <AiArrived as="li" key={`${row.bullet.id}:${row.bullet.text}`} className="flex gap-2 px-3 py-1">
              <Text variant="reading" tone="ai" aria-hidden>•</Text>
              <Text variant="reading">{row.bullet.text}</Text>
            </AiArrived>
          ))}
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
