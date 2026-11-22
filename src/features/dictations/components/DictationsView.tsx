/** Dictations: every dictation made in the app, newest first under its day, searchable. Mac: the list beside the selected dictation;
 *  phone: the list, then one dictation with Back. Each opens to its time, day · length, its model and (cloud) cost badges,
 *  and the words; Copy and Delete. */

import React, { useState } from 'react';
import { ChevronLeft, Copy, Mic, Trash2 } from 'lucide-react';
import { Button, Icon, IconButton, PageScroll, Row, SearchField, Surface, Text, TitlebarSpacer, ViewBody, ViewHeader } from '@shared/ui';
import { CostBadge, ModelBadge, ScreenState, modelCreditOf } from '@shared/components';
import { useSessionCost } from '@shared/hooks/useSessionUsage';
import { useFormFactor } from '@platform/formFactor';
import { useToast } from '@shared/contexts/ToastContext';
import { confirmDelete } from '@shared/stores/confirmStore';
import { copyRichText } from '@shared/utils/clipboard';
import { formatDayLabel, formatDuration, formatClockTime, groupByLabel } from '@shared/utils/formatters';
import { LAYOUT } from '@config/layout.config';
import { DICTATIONS_CONFIG } from '@config/dictations.config';
import type { Dictation } from '@shared/types';
import { useDictations } from '@features/dictations/hooks/useDictations';

interface DictationListProps {
  dictations: Dictation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** The dictations under their day (Today, Yesterday, then dates, as Gallery groups), one line each: the words with the time
 *  of day beside them (length and model are on the open dictation). */
const DictationList: React.FC<DictationListProps> = ({ dictations, selectedId, onSelect }) => (
  <div className="space-y-3">
    {groupByLabel(dictations, (dictation) => formatDayLabel(dictation.createdAt)).map((day) => (
      <section key={day.label}>
        <Text as="h2" variant="label" tone="muted" className="px-2.5 pb-1">{day.label}</Text>
        {day.items.map((dictation) => (
          <Row key={dictation.id} selected={dictation.id === selectedId} onClick={() => onSelect(dictation.id)}>
            <Text as="span" truncate className="min-w-0 flex-1">{dictation.text}</Text>
            <Text as="span" variant="figureSmall" tone="muted" className="shrink-0">{formatClockTime(dictation.createdAt)}</Text>
          </Row>
        ))}
      </section>
    ))}
  </div>
);

interface DictationDetailProps {
  dictation: Dictation;
  onCopy: () => void;
  onDelete: () => void;
}

/** Voice Memos' shape: the time as the title, day · length and the model's badges under it, then the words at reading size. */
const DictationDetail: React.FC<DictationDetailProps> = ({ dictation, onCopy, onDelete }) => {
  const credit = modelCreditOf(dictation.model);
  const cost = useSessionCost(dictation.id);
  const facts = [
    formatDayLabel(dictation.createdAt),
    dictation.durationMs !== undefined && formatDuration(dictation.durationMs / 1000),
  ].filter(Boolean).join(' · ');
  return (
    <article>
      <Surface as="header" edge="bottom" className={`flex items-start gap-2 ${LAYOUT.listGutter} py-4`}>
        <div className="min-w-0 flex-1">
          <Text as="h2" variant="title">{formatClockTime(dictation.createdAt)}</Text>
          <div className="flex min-w-0 items-center gap-1.5">
            <Text variant="helper" tone="muted" className="shrink-0">{facts}</Text>
            {credit && <ModelBadge {...credit} />}
            <CostBadge cost={cost} />
          </div>
        </div>
        <IconButton icon={Copy} label="Copy" size="sm" onClick={onCopy} />
        <IconButton icon={Trash2} label="Delete dictation" size="sm" variant="dangerGhost" onClick={onDelete} />
      </Surface>
      <Text as="p" variant="reading" className={`select-text whitespace-pre-wrap ${LAYOUT.listGutter} py-4`}>{dictation.text}</Text>
    </article>
  );
};

export const DictationsView: React.FC = () => {
  const [query, setQuery] = useState('');
  const { dictations, hasAny, isLoading, remove } = useDictations(query);
  const phone = useFormFactor() === 'phone';
  const { showToast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // A Mac always shows one dictation (the newest match until another is picked); a phone shows the list until one is tapped.
  const selected = dictations.find((d) => d.id === selectedId) ?? (phone ? undefined : dictations[0]);

  const copy = (dictation: Dictation) => {
    copyRichText(dictation.text)
      .then(() => showToast('Copied', 'success'))
      .catch((error: unknown) => console.error('[Dictations] Copy failed:', error));
  };

  const deleteDictation = async (dictation: Dictation) => {
    if (!(await confirmDelete('dictation'))) return;
    if (dictation.id === selectedId) setSelectedId(null);
    remove(dictation.id);
  };

  const detail = selected && (
    <DictationDetail
      dictation={selected}
      onCopy={() => copy(selected)}
      onDelete={() => void deleteDictation(selected)}
    />
  );

  // Search, then the matching rows; a quiet line only when there are dictations and the search matches none.
  const searchAndList = (
    <>
      <SearchField value={query} onChange={setQuery} onCancel={() => setQuery('')} placeholder={DICTATIONS_CONFIG.searchPlaceholder} />
      <PageScroll underTitlebar={false} className="min-h-0 flex-1 pb-2">
        {dictations.length > 0
          ? <DictationList dictations={dictations} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
          : hasAny && <Text as="p" variant="helper" tone="muted" className="px-2.5 py-2">{DICTATIONS_CONFIG.noMatch}</Text>}
      </PageScroll>
    </>
  );

  if (isLoading || !hasAny) {
    return (
      <div className="flex h-full flex-col">
        <ViewHeader title={DICTATIONS_CONFIG.title} />
        <ScreenState loading={isLoading} empty={{ icon: Mic, message: DICTATIONS_CONFIG.empty }} />
      </div>
    );
  }

  // iPhone: one dictation with Back to the list.
  if (phone && selected) {
    return (
      <div className="flex h-full flex-col">
        <TitlebarSpacer />
        <header className={`shrink-0 ${LAYOUT.listGutter} pt-2 pb-2`}>
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
            <Icon icon={ChevronLeft} size="xs" />
            {DICTATIONS_CONFIG.title}
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">{detail}</div>
      </div>
    );
  }

  // The view's header, then (Mac) the list beside the open dictation in one hairline panel, as a meeting's panes: its top
  // level with the search field, its lines ending at its own rounded corners. iPhone: the list alone.
  return (
    <div className="flex h-full flex-col">
      <ViewHeader title={DICTATIONS_CONFIG.title} />
      <ViewBody className="gap-6">
        <div className={`flex min-h-0 flex-col gap-3 ${phone ? 'flex-1' : DICTATIONS_CONFIG.listColumn}`}>{searchAndList}</div>
        {!phone && detail && (
          <Surface edge={['top', 'left', 'right']} radius="lg" className="min-w-0 flex-1 overflow-y-auto custom-scrollbar">{detail}</Surface>
        )}
      </ViewBody>
    </div>
  );
};
