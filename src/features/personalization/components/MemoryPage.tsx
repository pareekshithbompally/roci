/** Personalization › Memory: Use Memory, then the saved memories — an editable table on Mac and iPad, a searchable list on
 *  iPhone; a memory edits in a sheet; Delete All asks first. */

import React, { useMemo, useState } from 'react';
import { CardRow, ChoiceControl, Section, Switch, Text, type DataColumn } from '@shared/ui';
import { EditableList, KnowledgeGraph } from '@shared/components';
import { UI_CONFIG } from '@config/ui.config';
import { useOpenMeeting } from '@features/history';
import { SettingsPage } from '@features/settings/components/shared';
import { useSettings } from '@shared/contexts/SettingsContext';
import { PERSONALIZATION_CONFIG } from '@config/personalization.config';
import { confirm } from '@shared/stores/confirmStore';
import { formatRelativeTime } from '@shared/utils/formatters';
import { memoryEnabled } from '@shared/utils/personalization';
import type { MemoryEntityRow, MemoryRow } from '@shared/types/native';
import { aboutLabel } from '@shared/utils/memories';
import { useMemories } from '@features/personalization/hooks/useMemories';
import { usePersonalizationUpdate } from '@features/personalization/hooks/usePersonalization';
import { MemoryDialog } from './MemoryDialog';

const COPY = PERSONALIZATION_CONFIG.memory.copy;

/** Who or what a memory is about: "Priya Raman (person)", or You. */
const aboutOf = (m: MemoryRow, entities: readonly MemoryEntityRow[]) => aboutLabel(m, entities) ?? COPY.you;

const columnsFor = (entities: readonly MemoryEntityRow[]): ReadonlyArray<DataColumn<MemoryRow>> => [
  { key: 'text', header: COPY.columns.text, cell: (m) => <Text truncate>{m.text}</Text> },
  { key: 'about', header: COPY.columns.about, cell: (m) => <Text tone="muted" truncate>{aboutOf(m, entities)}</Text> },
  { key: 'updated', header: COPY.columns.updated, align: 'end', cell: (m) => <Text tone="muted">{formatRelativeTime(m.updated_at, { short: true })}</Text> },
];

/** Which memory the sheet is open for: a new one (no memory), an existing one, or closed. */
type Editing = { memory?: MemoryRow } | null;

const UseMemory: React.FC = () => {
  const { settings } = useSettings();
  const update = usePersonalizationUpdate();
  const on = memoryEnabled(settings);
  return (
    <Section footer={COPY.useFooter}>
      <CardRow title={COPY.use} actions={<Switch checked={on} onCheckedChange={(enabled) => update(() => ({ memory: { enabled } }))} aria-label={COPY.use} />} />
    </Section>
  );
};

export const MemoryPage: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { memories, entities, save, remove, removeAll } = useMemories();
  const textOf = (m: MemoryRow) => `${m.text} ${aboutOf(m, entities)}`;
  const [editing, setEditing] = useState<Editing>(null);
  const columns = useMemo(() => columnsFor(entities), [entities]);
  const [view, setView] = useState<(typeof COPY.views)[number]['value']>('list');
  const openMeeting = useOpenMeeting();
  const openMemory = (id: string) => {
    const memory = memories.find((m) => m.id === id);
    if (memory) setEditing({ memory });
  };

  const deleteAll = async () => {
    const sure = await confirm({ title: COPY.deleteAllTitle, description: COPY.deleteAllDescription, confirmLabel: COPY.deleteAllConfirm, tone: 'danger' });
    if (sure) removeAll();
  };

  return (
    <SettingsPage title={COPY.title} onBack={onBack}>
      <UseMemory />
      <div className="flex justify-center">
        <ChoiceControl items={COPY.views} value={view} onValueChange={setView} label={COPY.viewsLabel} />
      </div>
      {view === 'graph' ? (
        <KnowledgeGraph
          focus={null}
          height={UI_CONFIG.graph.height.settings}
          onOpenMeeting={(id) => void openMeeting({ id })}
          onOpenMemory={openMemory}
        />
      ) : (
        <EditableList
          title={COPY.section}
          footer={COPY.footer}
          rows={memories}
          rowKey={(m) => m.id}
          columns={columns}
          phoneRow={(m) => ({ title: m.text, description: aboutOf(m, entities) })}
          text={textOf}
          copy={{ search: COPY.search, add: COPY.add, remove: COPY.remove, empty: COPY.empty }}
          onAdd={() => setEditing({})}
          onOpen={(memory) => setEditing({ memory })}
          onRemove={(m) => remove(m.id)}
        />
      )}
      {memories.length > 0 && (
        <Section>
          <CardRow title={COPY.deleteAll} tone="danger" onPress={() => void deleteAll()} />
        </Section>
      )}
      {editing && <MemoryDialog memory={editing.memory} entities={entities} onSave={save} onClose={() => setEditing(null)} />}
    </SettingsPage>
  );
};
