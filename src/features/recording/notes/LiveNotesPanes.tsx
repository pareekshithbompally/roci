/** The record screen's two note panes: the user's shorthand, and the enhanced bullets the Summary model keeps up to date. */

import React, { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { Icon, Text, Textarea } from '@shared/ui';
import { LIVE_NOTES_CONFIG as NOTES } from '@config/liveNotes.config';
import { useLiveNotesStore } from './liveNotesStore';

/** A pane's heading, with an optional glyph and trailing status. */
export const PaneLabel: React.FC<{ icon?: typeof Sparkles; children: React.ReactNode; trailing?: React.ReactNode }> = ({ icon, children, trailing }) => (
  <div className="flex shrink-0 items-center gap-1.5 px-4 pt-3 pb-2">
    {icon && <Icon icon={icon} size="xs" tone="ai" />}
    <Text variant="label" tone="muted">{children}</Text>
    {trailing}
  </div>
);

export const YourNotes: React.FC<{ onType: (text: string) => void }> = ({ onType }) => {
  const lines = useLiveNotesStore((s) => s.lines);
  const value = useMemo(() => lines.map((l) => l.text).join('\n'), [lines]);
  return (
    <section className="flex h-full min-h-0 flex-col">
      <PaneLabel>{NOTES.copy.yourNotes}</PaneLabel>
      <Textarea
        variant="bare"
        autoFocus
        value={value}
        onChange={(event) => onType(event.target.value)}
        placeholder={NOTES.copy.placeholder}
        aria-label={NOTES.copy.yourNotes}
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-4"
      />
    </section>
  );
};

export const EnhancedNotes: React.FC<{ hasModel: boolean }> = ({ hasModel }) => {
  const bullets = useLiveNotesStore((s) => s.bullets);
  const updating = useLiveNotesStore((s) => s.updating);
  return (
    <section className="flex h-full min-h-0 flex-col">
      <PaneLabel icon={Sparkles} trailing={updating && <Text variant="caption" shimmer>{NOTES.copy.updating}</Text>}>
        {NOTES.copy.enhanced}
      </PaneLabel>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-4">
        {bullets.length > 0 ? (
          <ul className="list-disc space-y-2 pl-5">
            {bullets.map((bullet) => <Text as="li" key={bullet.id} variant="reading">{bullet.text}</Text>)}
          </ul>
        ) : (
          <Text as="p" variant="body" tone="muted">{hasModel ? NOTES.copy.enhancedEmpty : NOTES.copy.noModel}</Text>
        )}
      </div>
    </section>
  );
};
