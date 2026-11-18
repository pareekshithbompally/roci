/** Dictations: every dictation made in the app, grouped by day. Mac: the list beside the selected dictation; phone: the
 *  list, then one dictation with Back. Each opens to its time, day · length · model, and the words; Copy, and Delete in ⋯. */

import React, { useMemo, useState } from 'react';
import { ChevronLeft, Copy, Mic, MoreHorizontal } from 'lucide-react';
import { Button, Icon, IconButton, Row, RowGroupLabel, Surface, Text, TitlebarSpacer } from '@shared/ui';
import { EmptyState, Menu } from '@shared/components';
import { useFormFactor } from '@platform/formFactor';
import { useToast } from '@shared/contexts/ToastContext';
import { confirmDelete } from '@shared/stores/confirmStore';
import { copyRichText } from '@shared/utils/clipboard';
import { formatDayLabel, formatDuration } from '@shared/utils/formatters';
import { useSpeechModelOptions } from '@features/settings/hooks';
import { LAYOUT } from '@config/layout.config';
import { DICTATIONS_CONFIG } from '@config/dictations.config';
import type { Dictation } from '@shared/types';
import { useDictations } from '@features/dictations/hooks/useDictations';

const timeOf = (createdAt: number) => new Date(createdAt).toLocaleTimeString(undefined, { timeStyle: 'short' });

/** "14:32 · 0:21": when it was said and for how long. */
const metaOf = (dictation: Dictation) =>
  [timeOf(dictation.createdAt), dictation.durationMs !== undefined && formatDuration(dictation.durationMs / 1000)].filter(Boolean).join(' · ');

interface DictationListProps {
  days: ReturnType<typeof useDictations>['days'];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const DictationList: React.FC<DictationListProps> = ({ days, selectedId, onSelect }) => (
  <>
    {days.map((day) => (
      <section key={day.label}>
        <RowGroupLabel>{day.label}</RowGroupLabel>
        {day.items.map((dictation) => (
          <Row key={dictation.id} selected={dictation.id === selectedId} onClick={() => onSelect(dictation.id)}>
            <span className="flex min-w-0 flex-1 flex-col">
              <Text as="span" variant="body" className="line-clamp-2">{dictation.text}</Text>
              <Text as="span" variant="caption" tone="muted">{metaOf(dictation)}</Text>
            </span>
          </Row>
        ))}
      </section>
    ))}
  </>
);

interface DictationDetailProps {
  dictation: Dictation;
  modelLabel: string | undefined;
  onCopy: () => void;
  onDelete: () => void;
}

/** Voice Memos' shape: the time as the title, day · length · model under it, then the words at reading size. */
const DictationDetail: React.FC<DictationDetailProps> = ({ dictation, modelLabel, onCopy, onDelete }) => {
  const facts = [
    formatDayLabel(dictation.createdAt),
    dictation.durationMs !== undefined && formatDuration(dictation.durationMs / 1000),
    modelLabel,
  ].filter(Boolean).join(' · ');
  return (
    <article>
      <Surface as="header" edge="bottom" className={`flex items-start gap-2 ${LAYOUT.listGutter} py-4`}>
        <div className="min-w-0 flex-1">
          <Text as="h2" variant="title">{timeOf(dictation.createdAt)}</Text>
          <Text as="p" variant="helper" tone="muted">{facts}</Text>
        </div>
        <Button variant="outline" size="sm" onClick={onCopy}>
          <Icon icon={Copy} size="xs" />
          Copy
        </Button>
        <Menu
          label="Dictation options"
          trigger={<IconButton icon={MoreHorizontal} label="Dictation options" size="sm" />}
          items={[{ type: 'item', label: 'Delete Dictation…', onSelect: onDelete, destructive: true }]}
        />
      </Surface>
      <Text as="p" variant="reading" className={`select-text whitespace-pre-wrap ${LAYOUT.listGutter} py-4`}>{dictation.text}</Text>
    </article>
  );
};

export const DictationsView: React.FC = () => {
  const { dictations, days, isLoading, remove } = useDictations();
  const phone = useFormFactor() === 'phone';
  const { showToast } = useToast();
  const speechModels = useSpeechModelOptions();
  const modelLabels = useMemo(() => new Map(speechModels.map((o) => [o.model, o.label])), [speechModels]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // A Mac always shows one dictation (the newest until another is picked); a phone shows the list until one is tapped.
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
      modelLabel={selected.model && (modelLabels.get(selected.model) ?? selected.model)}
      onCopy={() => copy(selected)}
      onDelete={() => void deleteDictation(selected)}
    />
  );
  const list = <DictationList days={days} selectedId={selected?.id ?? null} onSelect={setSelectedId} />;
  const count = dictations.length;

  return (
    <div className="flex h-full flex-col">
      <TitlebarSpacer />
      <Surface as="header" edge="bottom" className={`shrink-0 ${LAYOUT.listGutter} pt-2 pb-3`}>
        {phone && selected ? (
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
            <Icon icon={ChevronLeft} size="xs" />
            {DICTATIONS_CONFIG.title}
          </Button>
        ) : (
          <>
            <Text as="h1" variant="pageTitle">{DICTATIONS_CONFIG.title}</Text>
            {count > 0 && <Text as="p" variant="helper" tone="muted">{count} {count === 1 ? 'dictation' : 'dictations'}</Text>}
          </>
        )}
      </Surface>

      {!isLoading && count === 0 ? (
        <EmptyState icon={Mic} message={DICTATIONS_CONFIG.empty} />
      ) : phone ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar">{selected ? detail : <div className="px-2 py-2">{list}</div>}</div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <Surface edge="right" className={`${DICTATIONS_CONFIG.listColumn} overflow-y-auto custom-scrollbar px-2 py-2`}>{list}</Surface>
          <div className="min-w-0 flex-1 overflow-y-auto custom-scrollbar">{detail}</div>
        </div>
      )}
    </div>
  );
};
