/** iPhone search: the sidebar's magnifier grows into a full screen — the field at the top, the keyboard up, and the meetings
 *  and chats the search index finds filling in as you type (the ⌘K palette's own results: titles first, then where words
 *  matched inside transcripts and chats). The button and the field share one layout id, so one grows into the other;
 *  Cancel or a result fades the screen out in place, as iOS's search does. */

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, SearchX } from 'lucide-react';
import { Button, ICON_SIZE_PX, ICON_STROKE_WIDTH, PageScroll, Row, RowGroupLabel, SearchField, Surface, Text, useMotion } from '@shared/ui';
import { EmptyState, HighlightedText } from '@shared/components';
import { endSearch, setSearchQuery, useSearchActive, useSearchQuery, useSearchRound } from '@shared/stores/searchStore';
import { useResultCommands } from '@features/palette/hooks/useResultCommands';
import type { PaletteCommand } from '@features/palette/paletteTypes';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { PALETTE_CONFIG } from '@config/palette.config';
import { KIT_COPY } from '@config/kitCopy.config';

const MOTION = ANIMATION_CONFIG.search;
const COPY = PALETTE_CONFIG.phone;

/** One result: its glyph, the title with the typed words marked, and its date and where it matched. */
const ResultRow: React.FC<{ command: PaletteCommand; query: string; onRun: (command: PaletteCommand) => void }> = ({ command, query, onRun }) => {
  const Glyph = command.icon;
  return (
    <Row
      size="lg"
      flush
      onClick={() => onRun(command)}
      leading={Glyph && <Text tone="faint" className="inline-flex"><Glyph size={ICON_SIZE_PX.sm} strokeWidth={ICON_STROKE_WIDTH} /></Text>}
    >
      <span className="flex min-w-0 flex-col">
        <Text truncate><HighlightedText text={command.title} highlight={query} /></Text>
        {command.detail && <Text variant="helper" tone="muted" className="line-clamp-2">{command.detail}</Text>}
      </span>
    </Row>
  );
};

/** Nothing typed: a hint; nothing found: says so; else the results by kind. */
const Results: React.FC<{ query: string; onRun: (command: PaletteCommand) => void }> = ({ query, onRun }) => {
  const results = useResultCommands(query);
  const term = query.trim();
  if (!term) return <EmptyState icon={Search} message={COPY.hint} />;
  const groups = results.kinds.filter((group) => group.items.length > 0);
  if (groups.length === 0) return <EmptyState icon={SearchX} message={results.searching ? COPY.searching : COPY.none(term)} />;
  return (
    <>
      {groups.map((group) => (
        <section key={group.title}>
          <RowGroupLabel>{group.title}</RowGroupLabel>
          {group.items.map((command) => <ResultRow key={command.id} command={command} query={query} onRun={onRun} />)}
        </section>
      ))}
    </>
  );
};

export interface SearchScreenProps {
  /** A result opened (the shell closes the sidebar under it). */
  onOpened?: () => void;
}

export const SearchScreen: React.FC<SearchScreenProps> = ({ onOpened }) => {
  const open = useSearchActive();
  const motionOf = useMotion();
  const query = useSearchQuery();
  const round = useSearchRound();
  // Closed first, so the result lands on a clean screen.
  const run = (command: PaletteCommand) => {
    endSearch();
    onOpened?.();
    command.perform?.();
  };
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="search" className="fixed inset-0 z-modal" initial={MOTION.hidden} animate={MOTION.shown} exit={{ ...MOTION.hidden, transition: motionOf('fadeOut') }} transition={motionOf('fadeIn')}>
          <Surface variant="page" className="flex h-full flex-col pt-safe-top">
            <div className="flex shrink-0 items-center gap-3 px-4 py-2">
              <motion.div layoutId={MOTION.morphId(round)} transition={motionOf(MOTION.morph)} className="min-w-0 flex-1">
                <SearchField value={query} onChange={setSearchQuery} onCancel={endSearch} placeholder={COPY.placeholder} autoFocus />
              </motion.div>
              <Button variant="link" size="inline" onClick={endSearch}>{KIT_COPY.cancel}</Button>
            </div>
            <motion.div className="flex min-h-0 flex-1 flex-col" initial={MOTION.resultsHidden} animate={MOTION.shown} exit={{ ...MOTION.hidden, transition: motionOf('fadeOut') }} transition={motionOf('move', MOTION.resultsDelay)}>
              <PageScroll underTitlebar={false} className="flex flex-1 flex-col px-4 pb-safe-bottom">
                <Results query={query} onRun={run} />
              </PageScroll>
            </motion.div>
          </Surface>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
