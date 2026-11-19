/** Dictations: every dictation made in the app, newest first, searchable. Mac: the list beside the selected dictation;
 *  phone: the list, then one dictation with Back. Each opens to its time, day · length · model (with its logo), and the words; Copy and Delete. */

import React, { useMemo, useState } from 'react';
import { ChevronLeft, Copy, Mic, Trash2 } from 'lucide-react';
import { Button, Icon, ICON_SIZE_PX, IconButton, Row, SearchField, Surface, Text, TitlebarSpacer } from '@shared/ui';
import { EmptyState, ModelIcon } from '@shared/components';
import { useFormFactor } from '@platform/formFactor';
import { useToast } from '@shared/contexts/ToastContext';
import { confirmDelete } from '@shared/stores/confirmStore';
import { copyRichText } from '@shared/utils/clipboard';
import { formatDayLabel, formatDuration, formatClockTime, formatRelativeTime } from '@shared/utils/formatters';
import { useSpeechModelOptions } from '@features/settings/hooks';
import { LAYOUT } from '@config/layout.config';
import { DICTATIONS_CONFIG } from '@config/dictations.config';
import type { Dictation } from '@shared/types';
import { useDictations } from '@features/dictations/hooks/useDictations';

/** The speech model a dictation names, as the pickers show it. */
interface SpeechModel {
  provider: string;
  label: string;
}

/** "0:21 · Parakeet": how long it was and which model heard it. */
const detailLine = (dictation: Dictation, speechModel: SpeechModel | undefined) =>
  [dictation.durationMs !== undefined && formatDuration(dictation.durationMs / 1000), speechModel?.label].filter(Boolean).join(' · ');

interface DictationListProps {
  dictations: Dictation[];
  modelsById: Map<string, SpeechModel>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** One row per dictation: its words on one line with the time ago beside them, length · model under them. */
const DictationList: React.FC<DictationListProps> = ({ dictations, modelsById, selectedId, onSelect }) => (
  <>
    {dictations.map((dictation) => (
      <Row key={dictation.id} size="lg" selected={dictation.id === selectedId} onClick={() => onSelect(dictation.id)}>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-baseline gap-3">
            <Text as="span" variant="bodyStrong" truncate className="min-w-0 flex-1">{dictation.text}</Text>
            <Text as="span" variant="figureSmall" tone="muted" className="shrink-0">{formatRelativeTime(dictation.createdAt, { short: true })}</Text>
          </span>
          <Text as="span" variant="helper" tone="muted" truncate>{detailLine(dictation, dictation.model ? modelsById.get(dictation.model) : undefined)}</Text>
        </span>
      </Row>
    ))}
  </>
);

interface DictationDetailProps {
  dictation: Dictation;
  speechModel: SpeechModel | undefined;
  onCopy: () => void;
  onDelete: () => void;
}

/** Voice Memos' shape: the time as the title, day · length · model under it, then the words at reading size. */
const DictationDetail: React.FC<DictationDetailProps> = ({ dictation, speechModel, onCopy, onDelete }) => {
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
            <Text variant="helper" tone="muted">{facts}</Text>
            {speechModel && (
              <>
                <Text variant="helper" tone="muted">·</Text>
                <ModelIcon provider={speechModel.provider} modelId={dictation.model} size={ICON_SIZE_PX.xs} />
                <Text variant="helper" tone="muted" truncate>{speechModel.label}</Text>
              </>
            )}
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
  const speechModels = useSpeechModelOptions();
  const modelsById = useMemo(() => new Map(speechModels.map((o) => [o.model, { provider: o.provider, label: o.label }])), [speechModels]);
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
      speechModel={selected.model ? modelsById.get(selected.model) : undefined}
      onCopy={() => copy(selected)}
      onDelete={() => void deleteDictation(selected)}
    />
  );

  // Title, search, then the matching rows (or a quiet line when none match).
  const listPane = (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-col gap-3 px-2 pt-2 pb-2">
        <Text as="h1" variant="pageTitle" className="px-2.5">{DICTATIONS_CONFIG.title}</Text>
        <SearchField value={query} onChange={setQuery} onCancel={() => setQuery('')} placeholder={DICTATIONS_CONFIG.searchPlaceholder} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-2 pb-2">
        {dictations.length > 0
          ? <DictationList dictations={dictations} modelsById={modelsById} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
          : <Text as="p" variant="helper" tone="muted" className="px-2.5 py-2">{DICTATIONS_CONFIG.noMatch}</Text>}
      </div>
    </div>
  );

  if (!isLoading && !hasAny) {
    return (
      <div className="flex h-full flex-col">
        <TitlebarSpacer />
        <EmptyState icon={Mic} message={DICTATIONS_CONFIG.empty} />
      </div>
    );
  }

  if (phone) {
    return (
      <div className="flex h-full flex-col">
        <TitlebarSpacer />
        {selected ? (
          <>
            <header className={`shrink-0 ${LAYOUT.listGutter} pt-2 pb-2`}>
              <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                <Icon icon={ChevronLeft} size="xs" />
                {DICTATIONS_CONFIG.title}
              </Button>
            </header>
            <div className="flex-1 overflow-y-auto custom-scrollbar">{detail}</div>
          </>
        ) : listPane}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TitlebarSpacer />
      <div className="flex min-h-0 flex-1">
        <Surface edge="right" className={`${DICTATIONS_CONFIG.listColumn} flex flex-col`}>{listPane}</Surface>
        <div className="min-w-0 flex-1 overflow-y-auto custom-scrollbar">{detail}</div>
      </div>
    </div>
  );
};
