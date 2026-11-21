/** A meeting's transcript beside its notes: the record screen's body, and the meeting's Transcript tab after Stop, so the view
 *  you watched live is the view you keep. Mac and iPad show two panes; a phone shows one section at a time. */

import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Callout, Surface, Tabs, Text } from '@shared/ui';
import { useFormFactor } from '@platform/formFactor';
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

/** iPhone: one section at a time, picked with a segmented control. */
const Sections: React.FC<MeetingWorkspaceProps> = ({ transcript, notes }) => {
  const [section, setSection] = useState<PhoneSection>('transcript');
  const items = [{ value: 'transcript' as const, label: transcript.label }, { value: 'ai' as const, label: NOTES.copy.aiNotes }, { value: 'notes' as const, label: NOTES.copy.yourNotes }];
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Tabs items={items} value={section} onValueChange={setSection} label={NOTES.copy.sections} />
      <Surface edge={['top', 'left', 'right']} radius="lg" className="flex flex-1 min-h-0 flex-col overflow-hidden pt-3">
        {section === 'transcript' && <TranscriptBody {...transcript} />}
        {section === 'notes' && <YourNotes onType={notes.onType} autoFocus={notes.live} />}
        {section === 'ai' && <AiNotes {...notes} />}
      </Surface>
    </div>
  );
};

export const MeetingWorkspace: React.FC<MeetingWorkspaceProps> = (props) => {
  const Body = useFormFactor() === 'phone' ? Sections : Columns;
  return <Body {...props} />;
};
