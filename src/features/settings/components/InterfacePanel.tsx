/**
 * InterfacePanel Component
 *
 * Settings for interface customization, storage, search index management.
 * Data (index stats, disk usage, storage path, version) from systemInfoStore.
 * Re-index actions stay inline (they're operations, not state).
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Sun, Moon, Monitor, Copy, Check, FolderOpen, FolderSearch, RefreshCw, Loader2 } from 'lucide-react';
import { useTheme } from '@shared/hooks/useTheme';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { isTauriEnvironment } from '@services/tauri';
import { searchIndexingService } from '@services/searchIndexing.service';
import { useSystemInfo, systemInfoStore, DISK_USAGE_LABELS } from '@features/settings/stores/systemInfoStore';
import { SettingsPage } from './shared';
import { Badge, Button, Card, CardRow, Icon, IconButton, Section, Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue, Switch, Tabs, Text } from '@shared/ui';

import { useAppUpdate } from '@features/settings/hooks/useAppUpdate';
import { getProviderTitle } from '@shared/utils/provider.utils';
import { ConfirmDialog, ModelIcon } from '@shared/components';

export const InterfacePanel: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const { settings, setSettings, providers } = useSettings();
  const { showToast } = useToast();

  const appUpdate = useAppUpdate();

  // Data from store (survives unmounts)
  const {
    storagePath,
    storagePathError,
    diskUsage,
    appVersion,
    indexStats,
  } = useSystemInfo();

  const [storagePathCopied, setStoragePathCopied] = useState(false);
  const [rebuildConfirmOpen, setRebuildConfirmOpen] = useState(false);
  const [rebuildingPhase, setRebuildingPhase] = useState<'meetings' | 'chats' | 'kg' | null>(null);
  const [isRebuilding, setIsRebuilding] = useState(false);

  // Derived from providers (reactive via context)
  const allActiveModels = useMemo(() => {
    const models: Array<{ id: string; provider: string; name: string }> = [];
    providers.forEach(provider => {
      if (provider.active && provider.models) {
        provider.models.forEach(model => {
          models.push({ id: model.id, provider: provider.provider, name: model.name || model.id });
        });
      }
    });
    return models;
  }, [providers]);

  const modelsByProvider = useMemo(() => {
    const grouped: Record<string, typeof allActiveModels> = {};
    allActiveModels.forEach((model) => {
      if (!grouped[model.provider]) grouped[model.provider] = [];
      grouped[model.provider].push(model);
    });
    return grouped;
  }, [allActiveModels]);

  const loadIndexStats = useCallback(async () => {
    await systemInfoStore.refresh();
  }, []);

  const handleReindexMeetings = useCallback(async () => {
    setRebuildingPhase('meetings');
    try {
      const { ragIndexer } = await import('@extensions/rag');
      const meetingItems = await searchIndexingService.loadMeetingsForIndexing();
      const indexed = await ragIndexer.indexAll(meetingItems, { includeEmbeddings: true, force: true });
      showToast(`Re-indexed ${indexed}/${meetingItems.length} meetings`, 'success');
    } catch (error: unknown) {
      console.error('[InterfacePanel] Meeting re-index failed:', error);
      showToast(error instanceof Error ? error.message : 'Meeting re-index failed', 'error');
    } finally {
      setRebuildingPhase(null);
      loadIndexStats();
    }
  }, [showToast, loadIndexStats]);

  const handleReindexChats = useCallback(async () => {
    setRebuildingPhase('chats');
    try {
      const { chatIndexer } = await import('@extensions/rag');
      const chatSessions = await searchIndexingService.loadChatsForIndexing();
      const indexed = await chatIndexer.indexAllSessions(chatSessions, { includeEmbeddings: true, force: true });
      showToast(`Re-indexed ${indexed}/${chatSessions.length} chats`, 'success');
    } catch (error: unknown) {
      console.error('[InterfacePanel] Chat re-index failed:', error);
      showToast(error instanceof Error ? error.message : 'Chat re-index failed', 'error');
    } finally {
      setRebuildingPhase(null);
      loadIndexStats();
    }
  }, [showToast, loadIndexStats]);

  const handleReindexKG = useCallback(async () => {
    const kgModel = settings.kgExtractionModel || settings.chatModel;
    if (!kgModel) {
      showToast('Select an extraction model first', 'error');
      return;
    }
    setRebuildingPhase('kg');
    try {
      const { ragIndexer } = await import('@extensions/rag');
      const meetingItems = await searchIndexingService.loadMeetingsForIndexing();
      const extracted = await ragIndexer.extractAll(
        meetingItems,
        { settings: { ...settings, chatModel: kgModel }, providers },
      );
      showToast(`Extracted entities for ${extracted} meetings`, 'success');
    } catch (error: unknown) {
      console.error('[InterfacePanel] KG extraction failed:', error);
      showToast(error instanceof Error ? error.message : 'KG extraction failed', 'error');
    } finally {
      setRebuildingPhase(null);
      loadIndexStats();
    }
  }, [settings, providers, showToast, loadIndexStats]);

  const handleRebuildIndex = useCallback(async () => {
    setRebuildConfirmOpen(false);
    setIsRebuilding(true);

    try {
      const { vectorDB, ragIndexer, chatIndexer, preloadModel } = await import('@extensions/rag');

      await vectorDB.rebuild();

      try { await preloadModel(); } catch { /* consent denied or download failed */ }

      const [meetingItems, chatSessions] = await Promise.all([
        searchIndexingService.loadMeetingsForIndexing(),
        searchIndexingService.loadChatsForIndexing(),
      ]);

      console.log(`[InterfacePanel] Rebuild: ${meetingItems.length} meetings, ${chatSessions.length} chats`);

      setRebuildingPhase('meetings');
      let meetingsIndexed = 0;
      try {
        const kgModel = settings.kgExtractionModel || settings.chatModel;
        const extractionContext = kgModel
          ? { settings: { ...settings, chatModel: kgModel }, providers }
          : undefined;
        meetingsIndexed = await ragIndexer.indexAll(meetingItems, {
          includeEmbeddings: true,
          extractionContext,
        });
      } catch (error: unknown) {
        console.error('[InterfacePanel] Meeting indexing failed:', error);
        showToast('Meeting indexing failed — continuing with chats', 'error');
      }
      loadIndexStats();

      setRebuildingPhase('chats');
      let chatsIndexed = 0;
      try {
        chatsIndexed = await chatIndexer.indexAllSessions(chatSessions, {
          includeEmbeddings: true,
        });
      } catch (error: unknown) {
        console.error('[InterfacePanel] Chat indexing failed:', error);
        showToast('Chat indexing failed', 'error');
      }
      loadIndexStats();

      showToast(
        `Rebuilt index: ${meetingsIndexed}/${meetingItems.length} meetings, ${chatsIndexed}/${chatSessions.length} chats`,
        'success',
      );
    } catch (error: unknown) {
      console.error('[InterfacePanel] Rebuild index failed:', error);
      showToast(error instanceof Error ? error.message : 'Failed to rebuild index', 'error');
    } finally {
      setRebuildingPhase(null);
      setIsRebuilding(false);
      loadIndexStats();
    }
  }, [settings, providers, showToast, loadIndexStats]);

  const handleOpenInFinder = async () => {
    if (!storagePath) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('reveal_in_file_manager', { path: storagePath.replace(/[/\\]+$/, '') });
    } catch (error) {
      console.error('[InterfacePanel] Failed to open in Finder:', error);
    }
  };

  const handleCopyStoragePath = async () => {
    if (!storagePath) return;
    try {
      await navigator.clipboard.writeText(storagePath);
      setStoragePathCopied(true);
      setTimeout(() => setStoragePathCopied(false), 1500);
    } catch (error) {
      console.error('[InterfacePanel] Failed to copy storage path:', error);
    }
  };

  const handleCheckForUpdate = async () => {
    const hasUpdate = await appUpdate.checkForUpdate();
    if (!hasUpdate) {
      showToast('You\u2019re on the latest version', 'success');
    }
  };

  const themeOptions = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ] as const;
  const themeTabs = themeOptions.map(({ value, icon, label }) => ({
    value,
    label: (
      <span className="flex items-center gap-1.5">
        <Icon icon={icon} size="xs" />
        {label}
      </span>
    ),
  }));

  const indexBusy = rebuildingPhase !== null || isRebuilding;

  return (
    <SettingsPage title="System" description="Appearance, storage, and system information.">
      {/* Appearance — theme + import processing */}
      <Section title="Appearance">
        <CardRow title="Theme" actions={<Tabs items={themeTabs} value={theme} onValueChange={setTheme} />} />

        {/* Model icons — opt-in: loads org avatars from huggingface.co */}
        <CardRow
          title="Model Icons"
          description="Show Hugging Face org icons on local models. Loads images from huggingface.co."
          actions={
            <Switch
              size="sm"
              checked={!!settings.showModelAvatars}
              onCheckedChange={(checked) => setSettings({ showModelAvatars: checked })}
              aria-label="Show model icons"
            />
          }
        />

        <CardRow
          title="Tool Activity"
          description="Show each tool the assistant uses, inline in its answer."
          actions={
            <Switch
              size="sm"
              checked={!settings.hideToolCalls}
              onCheckedChange={(checked) => setSettings({ hideToolCalls: !checked })}
              aria-label="Show tool activity"
            />
          }
        />

        <CardRow
          title="Import Processing"
          description="How imported audio files are processed."
          actions={
            <>
              <div className="w-36">
                <Select
                  value={settings.jobProcessing?.mode || 'sequential'}
                  onValueChange={(val) => setSettings({
                    jobProcessing: {
                      mode: val as 'sequential' | 'parallel',
                      maxConcurrent: settings.jobProcessing?.maxConcurrent ?? 2,
                    },
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sequential">Sequential</SelectItem>
                    <SelectItem value="parallel">Parallel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {settings.jobProcessing?.mode === 'parallel' && (
                <div className="w-28">
                  <Select
                    value={String(settings.jobProcessing?.maxConcurrent ?? 2)}
                    onValueChange={(val) => setSettings({
                      jobProcessing: {
                        mode: 'parallel',
                        maxConcurrent: Number(val),
                      },
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 7 }, (_, i) => i + 2).map(n => (
                        <SelectItem key={n} value={String(n)}>
                          {n} concurrent
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          }
        />
      </Section>

      {isTauriEnvironment() && (
        <Section title="Storage Location">
          <div className="flex items-center gap-2 py-3">
            <Icon icon={FolderOpen} size="sm" tone="faint" className="shrink-0" />
            <Text tone="muted" truncate className="flex-1">{storagePath ?? PENDING}</Text>
            <IconButton icon={FolderSearch} label="Open in Finder" size="sm" onClick={handleOpenInFinder} disabled={!storagePath} />
            <Button variant="ghost" size="iconSm" onClick={handleCopyStoragePath} aria-label="Copy path" disabled={!storagePath}>
              <Icon icon={storagePathCopied ? Check : Copy} size="sm" tone={storagePathCopied ? 'success' : 'faint'} />
            </Button>
          </div>
          {storagePathError && (
            <Text as="p" variant="helper" tone="danger" className="py-3">{storagePathError}</Text>
          )}
        </Section>
      )}

      {isTauriEnvironment() && (
        <Section title="Disk Usage">
          {DISK_USAGE_LABELS.map((label) => {
            const entry = diskUsage?.find((d) => d.label === label);
            return (
              <CardRow key={label} title={label} actions={<Text variant="mono" tone="muted">{entry ? formatBytes(entry.bytes) : PENDING}</Text>} />
            );
          })}
          <CardRow
            title="Total"
            actions={<Text variant="mono" className="font-medium">{diskUsage ? formatBytes(diskUsage.reduce((sum, d) => sum + d.bytes, 0)) : PENDING}</Text>}
          />
        </Section>
      )}

      {isTauriEnvironment() && (
        <Section title="Search Index">
          <IndexActionRow
                label="Meetings"
                indexed={indexStats?.meetings.indexed}
                total={indexStats?.meetings.onDisk}
                detail={indexStats ? `${indexStats.chunks.transcript} transcript chunks` : PENDING}
                onReindex={handleReindexMeetings}
                busy={rebuildingPhase === 'meetings'}
                disabled={indexBusy}
              />
              <IndexActionRow
                label="Chats"
                indexed={indexStats?.chats.indexed}
                total={indexStats?.chats.onDisk}
                detail={indexStats ? `${indexStats.chunks.total - indexStats.chunks.transcript} chat chunks` : PENDING}
                onReindex={handleReindexChats}
                busy={rebuildingPhase === 'chats'}
                disabled={indexBusy}
              />
              <IndexActionRow
                label="Knowledge Graph"
                indexed={indexStats?.kg.nodes}
                detail={indexStats ? `${indexStats.kg.nodes} entities · ${indexStats.kg.edges} relationships` : PENDING}
                onReindex={handleReindexKG}
                busy={rebuildingPhase === 'kg'}
                disabled={indexBusy}
              />
              <CardRow
                title="Extraction model"
                actions={
                  <div className="w-44">
                    {allActiveModels.length > 0 ? (
                      <Select
                        value={settings.kgExtractionModel || settings.chatModel || undefined}
                        onValueChange={(modelId: string) => setSettings({ kgExtractionModel: modelId })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select model">
                            {(() => {
                              const selectedId = settings.kgExtractionModel || settings.chatModel;
                              const selected = allActiveModels.find(m => m.id === selectedId);
                              if (!selected) return 'Select model';
                              return (
                                <span className="flex items-center gap-1.5 truncate">
                                  <ModelIcon provider={selected.provider} modelId={selected.id} size={14} />
                                  <span className="truncate">{selected.name}</span>
                                </span>
                              );
                            })()}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(modelsByProvider).map(([provider, models]) => (
                            <SelectGroup key={provider}>
                              <SelectLabel>{getProviderTitle(provider)}</SelectLabel>
                              {models.map((model) => (
                                <SelectItem key={`kg-${model.provider}-${model.id}`} value={model.id}>
                                  <div className="flex items-center gap-1.5">
                                    <ModelIcon provider={model.provider} modelId={model.id} size={14} />
                                    <span className="truncate">{model.name}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Text variant="helper" tone="faint">No models available</Text>
                    )}
                  </div>
                }
              />

          <CardRow
            title="Rebuild All"
            description="Wipes and re-indexes all meetings, chats, and knowledge graph."
            actions={
              <Button variant="outline" size="sm" onClick={() => setRebuildConfirmOpen(true)} disabled={indexBusy}>
                <Icon icon={RefreshCw} size="xs" className={isRebuilding ? 'animate-spin' : ''} />
                {isRebuilding ? 'Rebuilding…' : 'Rebuild All'}
              </Button>
            }
          />

          <ConfirmDialog
            open={rebuildConfirmOpen}
            onOpenChange={setRebuildConfirmOpen}
            title="Rebuild search index?"
            description="This will clear the vector database and knowledge graph, then re-index all meetings and chats. This may take a while."
            confirmLabel="Rebuild All"
            onConfirm={handleRebuildIndex}
          />
        </Section>
      )}

      {/* App Info & Updates */}
      <Card>
        <CardRow title="Version" actions={<VersionStatus appVersion={appVersion} appUpdate={appUpdate} onCheck={handleCheckForUpdate} />} />
      </Card>
    </SettingsPage>
  );
};

/** Shown in a value slot until its data loads, so rows keep their place. */
const PENDING = '—';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/** Index row: status badge, counts, and a re-index button */
const IndexActionRow: React.FC<{
  label: string;
  /** Undefined until stats load. */
  indexed?: number;
  total?: number;
  detail?: string;
  onReindex: () => void;
  busy: boolean;
  disabled: boolean;
}> = ({ label, indexed, total, detail, onReindex, busy, disabled }) => (
    <CardRow
      title={
        <span className="flex items-center gap-2.5">
          {label}
          {indexed === undefined ? <Text variant="mono" tone="faint">{PENDING}</Text> : <IndexStatus indexed={indexed} total={total} />}
        </span>
      }
      description={detail}
      actions={
        <Button variant="outline" size="sm" onClick={onReindex} disabled={disabled}>
          <Icon icon={RefreshCw} size="xs" className={busy ? 'animate-spin' : ''} />
          {busy ? 'Indexing…' : 'Re-index'}
        </Button>
      }
    />
);

/** Synced/Stale (or Active/Empty without a total) badge plus the count. */
const IndexStatus: React.FC<{ indexed: number; total?: number }> = ({ indexed, total }) => {
  const isFresh = total == null ? indexed > 0 : indexed >= total;
  const statusLabel = total == null
    ? (indexed > 0 ? 'Active' : 'Empty')
    : (indexed >= total ? 'Synced' : 'Stale');
  return (
    <>
      <Badge variant={isFresh ? 'success' : 'error'}>{statusLabel}</Badge>
      {total != null && <Text variant="mono" tone="faint">{indexed}/{total}</Text>}
    </>
  );
};

/** Version number plus the update-check state. */
const VersionStatus: React.FC<{
  appVersion: string;
  appUpdate: ReturnType<typeof useAppUpdate>;
  onCheck: () => void;
}> = ({ appVersion, appUpdate, onCheck }) => (
  <>
    <Text variant="mono" tone="muted">{appVersion || '…'}</Text>
    {appUpdate.status === 'checking' && (
      <Text variant="helper" tone="muted" className="flex items-center gap-1.5">
        <Icon icon={Loader2} size="xs" className="animate-spin" />
        Checking…
      </Text>
    )}
    {appUpdate.status === 'idle' && !appUpdate.updateInfo && (
      <Button variant="link" size="inline" onClick={onCheck}>Check for Updates</Button>
    )}
    {appUpdate.status === 'available' && appUpdate.updateInfo && (
      <Text variant="helper" tone="success">v{appUpdate.updateInfo.version} available</Text>
    )}
    {appUpdate.status === 'error' && (
      <Text variant="helper" tone="danger">{appUpdate.error ?? 'Check failed'}</Text>
    )}
  </>
);

export default InterfacePanel;
