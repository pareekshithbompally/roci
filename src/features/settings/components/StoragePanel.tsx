/** Settings › Storage: location, Keep periods with Delete All…, space used, search index and the models.dev catalog. */

import React from 'react';
import { CardRow, Picker, Section, Text } from '@shared/ui';
import { StorageConfig } from '@config/storage.config';
import { LAYOUT } from '@config/layout.config';
import { confirm } from '@shared/stores/confirmStore';
import { useToast } from '@shared/contexts/ToastContext';
import { useRefreshModelCatalog } from '@shared/hooks/useModelCatalog';
import { formatCount, formatFileSize } from '@shared/utils/formatters';
import { platform } from '@platform/index';
import type { StorageUsage } from '@shared/types/native';
import { useKeepPeriod, useStorageClear, useStorageUsage, type StorageTarget } from '@features/settings/hooks/useStorage';
import { StorageLocationSection } from './StorageLocationSection';
import { SearchIndexSection } from './SearchIndexSection';
import { PENDING, SettingsPage } from './shared';
import { STORAGE_COPY as COPY } from '@config/settingsCopy.config';

const ACTIONS = StorageConfig.actions;

const { retention } = StorageConfig;
type StorageClass = (typeof retention.classes)[number];

/** The Keep menu's value for Delete All…: an action, never stored. */
const DELETE_ALL = 'delete';
const FOREVER = 'forever';

const KEEP_GROUPS = [
  {
    options: [
      ...retention.keepDays.map((days) => ({ value: String(days), label: formatCount(days, 'day') })),
      { value: FOREVER, label: retention.forever },
    ],
  },
  { options: [{ value: DELETE_ALL, label: retention.deleteAll }] },
];

/** "12 meetings", or "31 recordings · 82.4 MB" for a kind of file. */
function describe(usage: StorageUsage | undefined, item: StorageClass): string {
  if (!usage) return PENDING;
  if (item.id === 'meetings' || item.id === 'chats' || item.id === 'dictations') return formatCount(usage[item.id], item.noun);
  const kind = usage.assets.find((entry) => entry.kind === item.id);
  return kind ? `${formatCount(kind.count, item.noun)} · ${formatFileSize(kind.bytes)}` : formatCount(0, item.noun);
}

/** Asks first, then empties `target`; a failure is a toast and the figures roll back. */
function useConfirmedClear(): (target: StorageTarget, title: string, description: string) => Promise<void> {
  const clear = useStorageClear();
  const { showToast } = useToast();
  return async (target, title, description) => {
    if (!(await confirm({ title, description, confirmLabel: COPY.delete, tone: 'danger' }))) return;
    try {
      await clear.mutateAsync(target);
    } catch (error: unknown) {
      console.error('[StoragePanel] Clear failed:', target, error);
      showToast(COPY.deleteFailed, 'error');
    }
  };
}

/** A shorter period deletes older items at once, so it asks first, as Messages does. */
async function confirmShorter(item: StorageClass, from: number | undefined, to: number): Promise<boolean> {
  if (from !== undefined && to >= from) return true;
  return confirm({
    ...COPY.deleteOlder(item.label, formatCount(to, 'day')),
    confirmLabel: COPY.delete,
    tone: 'danger',
  });
}

const KeepRow: React.FC<{ item: StorageClass; usage: StorageUsage | undefined }> = ({ item, usage }) => {
  const [days, setDays] = useKeepPeriod(item.id);
  const clear = useConfirmedClear();
  const onChange = async (value: string) => {
    if (value === DELETE_ALL) {
      const { title, description } = COPY.deleteAll(item.label, item.deletes);
      await clear(item.id, title, description);
      return;
    }
    if (value === FOREVER) return setDays(undefined);
    if (await confirmShorter(item, days, Number(value))) setDays(Number(value));
  };
  return (
    <CardRow
      title={item.label}
      description={describe(usage, item)}
      actions={
        <div className={LAYOUT.settingsSelect}>
          <Picker label={COPY.keep(item.label)} value={days === undefined ? FOREVER : String(days)} onChange={(value) => void onChange(value)} placeholder="" groups={KEEP_GROUPS} />
        </div>
      }
    />
  );
};

const Figure: React.FC<{ bytes: number | undefined }> = ({ bytes }) => (
  <Text variant="figure" tone="muted">{bytes === undefined ? PENDING : formatFileSize(bytes)}</Text>
);

const SpaceSection: React.FC<{ usage: StorageUsage | undefined }> = ({ usage }) => {
  const clear = useConfirmedClear();
  const files = usage?.assets.reduce((sum, entry) => sum + entry.bytes, 0);
  const total = usage && files !== undefined ? files + usage.database_bytes + usage.cache_bytes + usage.models_bytes : undefined;
  return (
    <Section title={COPY.space}>
      <CardRow title={COPY.database} actions={<Figure bytes={usage?.database_bytes} />} />
      <CardRow
        title={COPY.cache}
        description={COPY.cacheDetail}
        actions={<Figure bytes={usage?.cache_bytes} />}
        action={{ label: ACTIONS.clearCache, onPress: () => void clear('cache', COPY.clearCache.title, COPY.clearCache.description) }}
      />
      <CardRow title={COPY.models} actions={<Figure bytes={usage?.models_bytes} />} />
      <CardRow title={COPY.total} actions={<Text variant="figure">{total === undefined ? PENDING : formatFileSize(total)}</Text>} />
    </Section>
  );
};

const CatalogSection: React.FC = () => {
  const refresh = useRefreshModelCatalog();
  const { showToast } = useToast();
  const onRefresh = () =>
    refresh.mutate(undefined, {
      onSuccess: () => showToast(COPY.catalogUpdated, 'success'),
      onError: () => showToast(COPY.catalogFailed, 'error'),
    });
  return (
    <Section title={COPY.catalog} footer={COPY.catalogFooter}>
      <CardRow title="models.dev" action={{ label: ACTIONS.refreshCatalog, onPress: onRefresh, busy: refresh.isPending }} />
    </Section>
  );
};

export const StoragePanel: React.FC = () => {
  const { data: usage } = useStorageUsage();
  return (
    <SettingsPage pane="storage">
      {platform.hasFileManager && <StorageLocationSection />}
      <Section title={retention.title} footer={retention.footer}>
        {retention.classes.map((item) => <KeepRow key={item.id} item={item} usage={usage} />)}
      </Section>
      <SpaceSection usage={usage} />
      <SearchIndexSection />
      <CatalogSection />
    </SettingsPage>
  );
};

export default StoragePanel;
