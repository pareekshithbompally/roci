/** A meeting's transcript beside its notes: the record screen's body, and the meeting's Transcript tab after Stop, so the view
 *  you watched live is the view you keep. Mac and iPad show two panes; a phone shows one section at a time. */

import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Callout, Surface, Tabs, Text, useListBesideDetail } from '@shared/ui';
import { LIVE_NOTES_CONFIG as NOTES, type PhoneSection } from '@config/liveNotes.config';
import { ParsedTranscript } from '@features/transcription';
import type { StoredTranscriptSegment } from '@shared/types';
import { AiNotes, EmptyLine, NotesPane, PaneHeader, YourNotes, type NotesPaneProps } from '@features/recording/notes/LiveNotesPanes';

export interface WorkspaceTranscript {
  label: string;
  segments: StoredTranscriptSegment[];
  /** A saved transcript with no segments (plain text). */
  text?: string;
  /** Shown while there are no segments. */
  empty: string;
  /** Why the live transcript stopped, above it (audio still records). */
  notice?: string;
  /** A streaming model's words still being revised, faint under the last turn. */
  footer?: string;
  /** Keep the newest line in view while the reader stays at the end (recording). */
  follow: boolean;
}

interface MeetingWorkspaceProps {
  transcript: WorkspaceTranscript;
  notes: NotesPaneProps;
  /** A phone inside a meeting's own tabs: show this one part (the tabs already pick it), with no control of its own. */
  only?: 'transcript' | 'notes';
}

/** The transcript, scrolling inside its pane; while following, it stays on the newest line unless the reader scrolled back. */
const TranscriptBody: React.FC<WorkspaceTranscript> = ({ segments, text, empty, notice, footer, follow }) => {
  const hasLines = segments.length > 0 || !!text;
  const reduceMotion = useReducedMotion() ?? false;
  const scrollRef = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);

  useEffect(() => {
    if (follow && atEnd.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [segments, footer, follow, reduceMotion]);

  const onScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    atEnd.current = scrollHeight - scrollTop - clientHeight <= NOTES.followSlackPx;
  };

  return (
    <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-4 space-y-2">
      {notice && <Callout variant="warning">{notice}</Callout>}
      {hasLines ? <ParsedTranscript text={text} segments={segments} /> : <EmptyLine>{empty}</EmptyLine>}
      {footer && hasLines && <Text as="p" variant="reading" tone="faint">{footer}</Text>}
    </div>
  );
};

const TranscriptPane: React.FC<WorkspaceTranscript> = (props) => (
  <section className="flex h-full min-h-0 flex-col">
    <PaneHeader><Text variant="label" tone="muted">{props.label}</Text></PaneHeader>
    <TranscriptBody {...props} />
  </section>
);

/** Mac and iPad: the transcript on the left, the notes on the right; each pane scrolls inside itself, the screen never does. */
const Columns: React.FC<MeetingWorkspaceProps> = ({ transcript, notes }) => (
  <Surface edge={['top', 'left', 'right']} radius="lg" className="grid h-full min-h-0 grid-cols-2 overflow-hidden">
    <Surface edge="right" className="min-h-0 min-w-0"><TranscriptPane {...transcript} /></Surface>
    <div className="min-h-0 min-w-0"><NotesPane {...notes} /></div>
  </Surface>
);

/** A phone's notes on one page: the summary's AI notes (after the meeting), then yours, each under its label (no switch, so
 *  no second row of tabs). */
const StackedNotes: React.FC<NotesPaneProps> = ({ onType, ai, focus }) => (
  <div className="flex h-full min-h-0 flex-col">
    {ai && (
      <>
        <PaneHeader><Text variant="label" tone="muted">{NOTES.copy.aiNotes}</Text></PaneHeader>
        <AiNotes {...ai} />
      </>
    )}
    <PaneHeader><Text variant="label" tone="muted">{NOTES.copy.yourNotes}</Text></PaneHeader>
    <YourNotes onType={onType} autoFocus={!!focus} />
  </div>
);

/** A phone inside the meeting's tabs: the one part the tabs picked. */
const OnePart: React.FC<MeetingWorkspaceProps & { only: 'transcript' | 'notes' }> = ({ transcript, notes, only }) => (
  <div className="flex h-full min-h-0 flex-col overflow-hidden pt-3">
    {only === 'transcript' ? <TranscriptBody {...transcript} /> : <StackedNotes {...notes} />}
  </div>
);

/** iPhone while recording: one section at a time, picked with the screen's one segmented control. */
const Sections: React.FC<MeetingWorkspaceProps> = ({ transcript, notes }) => {
  const [section, setSection] = useState<PhoneSection>('transcript');
  const short = NOTES.copy.sectionShort;
  const items = [
    { value: 'transcript' as const, label: transcript.label, short: short.transcript },
    { value: 'notes' as const, label: NOTES.copy.yourNotes, short: short.notes },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Tabs items={items} value={section} onValueChange={setSection} label={NOTES.copy.sections} />
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden pt-3">
        {section === 'transcript' && <TranscriptBody {...transcript} />}
        {section === 'notes' && <YourNotes onType={notes.onType} autoFocus />}
      </div>
    </div>
  );
};

export const MeetingWorkspace: React.FC<MeetingWorkspaceProps> = (props) => {
  const beside = useListBesideDetail();
  if (!beside && props.only) return <OnePart {...props} only={props.only} />;
  const Body = beside ? Columns : Sections;
  return <Body {...props} />;
};
