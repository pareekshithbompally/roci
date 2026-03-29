/**
 * InterfacePanel Component
 *
 * Settings for interface customization.
 * Self-contained — loads its own storage path state on mount.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Sun, Moon, Monitor, Copy, Check, FolderOpen, FolderSearch, RefreshCw, Database } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { isTauriEnvironment } from '@/services/tauri';
import { pathsService } from '@/services/storage';
import { searchIndexingService } from '@/services/searchIndexing.service';
import { meetingService } from '@/services/meeting.service';
import { IMPORT_CONFIG } from '@config/audio.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { SURFACE, BORDER, TEXT, RADIUS, LAYOUT, COMPONENT } from '@config/theme.config';
import { SettingsSection } from './shared';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel,
  AlertDialog, AlertDialogPortal, AlertDialogOverlay, AlertDialogContent,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@shared/ui';
import { useSettingsSave } from '../hooks/useSettingsSave';
import { getProviderTitle } from '@/utils/providerUtils';
import ProvidersAvatar from '@/components/ProvidersAvatar';

export const InterfacePanel: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const { settings, setSettings, providers } = useSettings();
  const { showToast } = useToast();
  const { hasUnsavedChanges } = useSettingsSave('System settings', 'interface');

  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [storagePathError, setStoragePathError] = useState<string | null>(null);
  const [storagePathCopied, setStoragePathCopied] = useState(false);
  const [diskUsage, setDiskUsage] = useState<{ label: string; bytes: number }[] | null>(null);
  const [rebuildConfirmOpen, setRebuildConfirmOpen] = useState(false);
  const [rebuildingPhase, setRebuildingPhase] = useState<'meetings' | 'chats' | 'kg' | 'all' | null>(null);

  // All active models grouped by provider (for KG model picker)
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

  const [indexStats, setIndexStats] = useState<{
    meetings: { indexed: number; onDisk: number };
    chats: { indexed: number; onDisk: number };
    chunks: { total: number; transcript: number };
    kg: { nodes: number; edges: number };
  } | null>(null);

  const loadIndexStats = useCallback(async () => {
    if (!isTauriEnvironment()) return;
    try {
      const { vectorDB } = await import('@extensions/rag');
      const [stats, diskMeetings, diskChats] = await Promise.all([
        vectorDB.getStats(),
        meetingService.listMeetings(),
        searchIndexingService.loadChatsForIndexing().then(c => c.length).catch(() => 0),
      ]);
      setIndexStats({
        meetings: { indexed: stats.total_meetings, onDisk: diskMeetings.length },
        chats: { indexed: stats.chat_sessions, onDisk: diskChats },
        chunks: { total: stats.total_chunks, transcript: stats.transcript_chunks },
        kg: { nodes: stats.kg_nodes, edges: stats.kg_edges },
      });
    } catch (error: unknown) {
      console.error('[InterfacePanel] Failed to load index stats:', error);
    }
  }, []);

  // Selective re-index: meetings only (chunks + embeddings, no wipe)
  const handleReindexMeetings = useCallback(async () => {
    setRebuildingPhase('meetings');
    try {
      const { ragIndexer } = await import('@extensions/rag');
      const meetingItems = await searchIndexingService.loadMeetingsForIndexing();
      console.log(`[InterfacePanel] Re-indexing ${meetingItems.length} meetings`);
      const indexed = await ragIndexer.indexAll(meetingItems, { includeEmbeddings: true });
      showToast(`Re-indexed ${indexed}/${meetingItems.length} meetings`, 'success');
    } catch (error: unknown) {
      console.error('[InterfacePanel] Meeting re-index failed:', error);
      showToast(error instanceof Error ? error.message : 'Meeting re-index failed', 'error');
    } finally {
      setRebuildingPhase(null);
      loadIndexStats();
      const { resetPipeline } = await import('@extensions/rag');
      resetPipeline();
    }
  }, [showToast, loadIndexStats]);

  // Selective re-index: chats only (chunks + embeddings, no wipe)
  const handleReindexChats = useCallback(async () => {
    setRebuildingPhase('chats');
    try {
      const { chatIndexer } = await import('@extensions/rag');
      const chatSessions = await searchIndexingService.loadChatsForIndexing();
      console.log(`[InterfacePanel] Re-indexing ${chatSessions.length} chats`);
      const indexed = await chatIndexer.indexAllSessions(chatSessions, { includeEmbeddings: true });
      showToast(`Re-indexed ${indexed}/${chatSessions.length} chats`, 'success');
    } catch (error: unknown) {
      console.error('[InterfacePanel] Chat re-index failed:', error);
      showToast(error instanceof Error ? error.message : 'Chat re-index failed', 'error');
    } finally {
      setRebuildingPhase(null);
      loadIndexStats();
      const { resetPipeline } = await import('@extensions/rag');
      resetPipeline();
    }
  }, [showToast, loadIndexStats]);

  // Selective re-index: KG entity extraction only (no re-chunking)
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
      console.log(`[InterfacePanel] Extracting KG for ${meetingItems.length} meetings`);
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

  // Full rebuild: wipe everything + re-index all phases
  const handleRebuildIndex = useCallback(async () => {
    setRebuildConfirmOpen(false);
    setRebuildingPhase('all');

    try {
      const { vectorDB, ragIndexer, chatIndexer } = await import('@extensions/rag');

      await vectorDB.rebuild();

      const [meetingItems, chatSessions] = await Promise.all([
        searchIndexingService.loadMeetingsForIndexing(),
        searchIndexingService.loadChatsForIndexing(),
      ]);

      console.log(`[InterfacePanel] Rebuild: ${meetingItems.length} meetings, ${chatSessions.length} chats to index`);

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

      let chatsIndexed = 0;
      try {
        chatsIndexed = await chatIndexer.indexAllSessions(chatSessions, {
          includeEmbeddings: true,
        });
      } catch (error: unknown) {
        console.error('[InterfacePanel] Chat indexing failed:', error);
        showToast('Chat indexing failed', 'error');
      }

      showToast(
        `Rebuilt index: ${meetingsIndexed}/${meetingItems.length} meetings, ${chatsIndexed}/${chatSessions.length} chats`,
        'success',
      );
    } catch (error: unknown) {
      console.error('[InterfacePanel] Rebuild index failed:', error);
      showToast(error instanceof Error ? error.message : 'Failed to rebuild index', 'error');
    } finally {
      setRebuildingPhase(null);
      loadIndexStats();
      const { resetPipeline } = await import('@extensions/rag');
      resetPipeline();
    }
  }, [settings, providers, showToast, loadIndexStats]);

  useEffect(() => {
    if (!isTauriEnvironment()) return;
    const load = async () => {
      try {
        const basePath = await pathsService.getBasePath();
        setStoragePath(basePath);
        loadDiskUsage(basePath);
      } catch (error) {
        console.error('[InterfacePanel] Failed to resolve storage path:', error);
        setStoragePathError('Unable to resolve storage location.');
      }
    };
    load();
    loadIndexStats();
  }, [loadIndexStats]);

  const loadDiskUsage = async (basePath: string) => {
    try {
      const { readDir, stat } = await import('@tauri-apps/plugin-fs');
      const { join } = await import('@tauri-apps/api/path');

      const dirs = [
        { label: 'Meetings', name: 'meetings' },
        { label: 'Recordings', name: 'recordings' },
        { label: 'Chats', name: 'chats' },
        { label: 'Cache', name: 'cache' },
        { label: 'Backend', name: 'llamacpp/bin' },
        { label: 'Models', name: 'llamacpp/models' },
      ];

      const sizes: { label: string; bytes: number }[] = [];

      for (const dir of dirs) {
        try {
          const dirPath = await join(basePath, dir.name);
          const total = await getDirSize(dirPath, readDir, stat, join);
          if (total > 0) sizes.push({ label: dir.label, bytes: total });
        } catch {
          // Directory may not exist yet
        }
      }

      // Add vectordb.sqlite size
      try {
        const dbPath = await join(basePath, 'vectordb.sqlite');
        const dbStat = await stat(dbPath);
        if (dbStat.size > 0) sizes.push({ label: 'Vector DB', bytes: dbStat.size });
      } catch {
        // DB may not exist yet
      }

      setDiskUsage(sizes);
    } catch (error) {
      console.error('[InterfacePanel] Failed to load disk usage:', error);
    }
  };

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

  const themeOptions = [
    { id: 'light', icon: Sun, label: 'Light' },
    { id: 'dark', icon: Moon, label: 'Dark' },
    { id: 'system', icon: Monitor, label: 'System' },
  ] as const;

  return (
    <div className={`h-full overflow-y-auto custom-scrollbar ${LAYOUT.settingsPadding} py-6`}>
    <div className={`${LAYOUT.settingsMaxWidth} mx-auto space-y-6`}>
      <div>
        <h3 className={`${TYPOGRAPHY_CLASSES.settingsTitle} ${TEXT.heading} mb-1`}>
          System
        </h3>
        <p className={`${TYPOGRAPHY_CLASSES.settingsDescription} ${TEXT.muted}`}>
          Appearance, storage, and system information.
        </p>
      </div>

      {/* Appearance — theme + import processing */}
      <SettingsSection title="Appearance">
        <div className={`border ${BORDER.default} ${RADIUS.lg} ${SURFACE.card} divide-y ${BORDER.divide}`}>
        {/* Theme row */}
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <span className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading}`}>
            Theme
          </span>
          <div className={`inline-flex ${RADIUS.lg} border ${BORDER.default} overflow-hidden`}>
            {themeOptions.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                role="radio"
                aria-checked={theme === id}
                onClick={() => setTheme(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 ${TYPOGRAPHY_CLASSES.settingsButton} transition-colors ${
                  theme === id
                    ? `${SURFACE.selectedCard} ${TEXT.heading}`
                    : `${TEXT.muted} ${SURFACE.hoverSubtle}`
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Job Processing row */}
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <span className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading}`}>
              Import Processing
            </span>
            <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} mt-0.5`}>
              How imported audio files are processed.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-36">
              <Select
                value={settings.jobProcessing?.mode || IMPORT_CONFIG.jobProcessing.defaultMode}
                onValueChange={(val) => setSettings({
                  jobProcessing: {
                    mode: val as 'sequential' | 'parallel',
                    maxConcurrent: settings.jobProcessing?.maxConcurrent ?? IMPORT_CONFIG.jobProcessing.defaultMaxConcurrent,
                  },
                })}
              >
                <SelectTrigger className={TYPOGRAPHY_CLASSES.settingsInput}>
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
                  value={String(settings.jobProcessing?.maxConcurrent ?? IMPORT_CONFIG.jobProcessing.defaultMaxConcurrent)}
                  onValueChange={(val) => setSettings({
                    jobProcessing: {
                      mode: 'parallel',
                      maxConcurrent: Number(val),
                    },
                  })}
                >
                  <SelectTrigger className={TYPOGRAPHY_CLASSES.settingsInput}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: IMPORT_CONFIG.jobProcessing.maxConcurrentLimit - 1 }, (_, i) => i + 2).map(n => (
                      <SelectItem key={n} value={String(n)}>
                        {n} concurrent
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
        </div>
      </SettingsSection>
      {storagePath && (
        <SettingsSection title="Storage Location">
          <div className={`flex items-center gap-2 px-4 py-3 ${SURFACE.card} border ${BORDER.default} ${RADIUS.lg}`}>
            <FolderOpen className={`w-4 h-4 ${TEXT.faint} shrink-0`} />
            <span className={`${TYPOGRAPHY_CLASSES.settingsInput} ${TEXT.secondary} truncate flex-1`}>
              {storagePath}
            </span>
            <button
              onClick={handleOpenInFinder}
              aria-label="Open in Finder"
              className={`p-1.5 ${SURFACE.hoverSubtle} ${RADIUS.md} transition-colors`}
            >
              <FolderSearch className={`w-4 h-4 ${TEXT.faint}`} />
            </button>
            <button
              onClick={handleCopyStoragePath}
              aria-label="Copy path"
              className={`p-1.5 ${SURFACE.hoverSubtle} ${RADIUS.md} transition-colors`}
            >
              {storagePathCopied ? (
                <Check className={`w-4 h-4 ${TEXT.success}`} />
              ) : (
                <Copy className={`w-4 h-4 ${TEXT.faint}`} />
              )}
            </button>
          </div>
          {storagePathError && (
            <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.error}`}>{storagePathError}</p>
          )}
        </SettingsSection>
      )}

      {/* Disk Usage */}
      {diskUsage && diskUsage.length > 0 && (
        <SettingsSection title="Disk Usage">
          <div className={`${SURFACE.card} border ${BORDER.default} ${RADIUS.lg} divide-y ${BORDER.divide}`}>
            {diskUsage.map(({ label, bytes }) => (
              <div key={label} className={`flex items-center justify-between px-4 py-3 ${TYPOGRAPHY_CLASSES.settingsInput}`}>
                <span className={TEXT.secondary}>{label}</span>
                <span className={`${TEXT.muted} font-mono`}>{formatBytes(bytes)}</span>
              </div>
            ))}
            <div className={`flex items-center justify-between px-4 py-3 ${SURFACE.subtle} ${TYPOGRAPHY_CLASSES.settingsInputLabel}`}>
              <span className={`font-medium ${TEXT.heading}`}>Total</span>
              <span className={`font-medium ${TEXT.heading} font-mono`}>
                {formatBytes(diskUsage.reduce((sum, d) => sum + d.bytes, 0))}
              </span>
            </div>
          </div>
        </SettingsSection>
      )}

      {/* Search Index */}
      {isTauriEnvironment() && (
        <SettingsSection title="Search Index">
          {/* All index rows in one card — Meetings, Chats, KG + extraction model */}
          {indexStats && (
            <div className={`${SURFACE.card} border ${BORDER.default} ${RADIUS.lg} divide-y ${BORDER.divide}`}>
              <IndexActionRow
                label="Meetings"
                indexed={indexStats.meetings.indexed}
                total={indexStats.meetings.onDisk}
                detail={`${indexStats.chunks.transcript} transcript chunks`}
                onReindex={handleReindexMeetings}
                busy={rebuildingPhase === 'meetings' || rebuildingPhase === 'all'}
                disabled={rebuildingPhase !== null}
              />
              <IndexActionRow
                label="Chats"
                indexed={indexStats.chats.indexed}
                total={indexStats.chats.onDisk}
                detail={`${indexStats.chunks.total - indexStats.chunks.transcript} chat chunks`}
                onReindex={handleReindexChats}
                busy={rebuildingPhase === 'chats' || rebuildingPhase === 'all'}
                disabled={rebuildingPhase !== null}
              />
              <IndexActionRow
                label="Knowledge Graph"
                indexed={indexStats.kg.nodes}
                detail={`${indexStats.kg.nodes} entities · ${indexStats.kg.edges} relationships`}
                onReindex={handleReindexKG}
                busy={rebuildingPhase === 'kg' || rebuildingPhase === 'all'}
                disabled={rebuildingPhase !== null}
              />
              {/* Extraction model — nested under KG */}
              <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
                  Extraction model
                </span>
                <div className="w-44 shrink-0">
                  {allActiveModels.length > 0 ? (
                    <Select
                      value={settings.kgExtractionModel || settings.chatModel || undefined}
                      onValueChange={(modelId: string) => setSettings({ kgExtractionModel: modelId })}
                    >
                      <SelectTrigger className="h-7 text-xs px-2.5">
                        <SelectValue placeholder="Select model">
                          {(() => {
                            const selectedId = settings.kgExtractionModel || settings.chatModel;
                            const selected = allActiveModels.find(m => m.id === selectedId);
                            if (!selected) return 'Select model';
                            return (
                              <span className="flex items-center gap-1.5 truncate">
                                <ProvidersAvatar provider={selected.provider} size={14} />
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
                              <SelectItem
                                key={`kg-${model.provider}-${model.id}`}
                                value={model.id}
                              >
                                <div className="flex items-center gap-1.5">
                                  <ProvidersAvatar provider={model.provider} size={14} />
                                  <span className="truncate">{model.name}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className={`text-xs ${TEXT.faint}`}>
                      No models available
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Rebuild All — nuclear option */}
          <div className={`flex items-center justify-between px-4 py-3 ${SURFACE.card} border ${BORDER.default} ${RADIUS.lg}`}>
            <div className="min-w-0 flex-1">
              <span className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading}`}>
                Rebuild All
              </span>
              <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} mt-0.5`}>
                Wipes and re-indexes all meetings, chats, and knowledge graph.
              </p>
            </div>
            <button
              onClick={() => setRebuildConfirmOpen(true)}
              disabled={rebuildingPhase !== null}
              className={`${COMPONENT.settingsButtonOutline} shrink-0 ml-4`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${rebuildingPhase === 'all' ? 'animate-spin' : ''}`} />
              {rebuildingPhase === 'all' ? 'Rebuilding…' : 'Rebuild All'}
            </button>
          </div>

          <AlertDialog open={rebuildConfirmOpen} onOpenChange={setRebuildConfirmOpen}>
            <AlertDialogPortal>
              <AlertDialogOverlay />
              <AlertDialogContent className="max-w-sm p-5">
                <AlertDialogTitle className={`${TYPOGRAPHY_CLASSES.summaryTitle} ${TEXT.heading} mb-1.5`}>
                  Rebuild search index?
                </AlertDialogTitle>
                <AlertDialogDescription className={`${TYPOGRAPHY_CLASSES.settingsDescription} ${TEXT.secondary} mb-5`}>
                  This will clear the vector database and knowledge graph, then re-index all meetings and chats. This may take a while.
                </AlertDialogDescription>
                <div className="flex gap-2.5 justify-end">
                  <AlertDialogCancel asChild>
                    <button className={COMPONENT.settingsButtonOutline}>
                      Cancel
                    </button>
                  </AlertDialogCancel>
                  <AlertDialogAction asChild>
                    <button
                      onClick={handleRebuildIndex}
                      className={COMPONENT.settingsButtonDanger}
                    >
                      Rebuild All
                    </button>
                  </AlertDialogAction>
                </div>
              </AlertDialogContent>
            </AlertDialogPortal>
          </AlertDialog>
        </SettingsSection>
      )}

      {/* App Info */}
      <div className={`pt-4 border-t ${BORDER.default}`}>
        <div className={`flex items-center justify-between px-4 py-3 ${TYPOGRAPHY_CLASSES.settingsInput}`}>
          <span className={TEXT.muted}>Version</span>
          <span className={`${TEXT.secondary} font-mono`}>1.0.0</span>
        </div>
      </div>
    </div>
    </div>
  );
};

/** Recursively compute directory size in bytes */
async function getDirSize(
  dirPath: string,
  readDir: (path: string) => Promise<Array<{ name: string; isDirectory: boolean; isFile: boolean }>>,
  stat: (path: string) => Promise<{ size: number }>,
  join: (...parts: string[]) => Promise<string>,
): Promise<number> {
  let total = 0;
  try {
    const entries = await readDir(dirPath);
    for (const entry of entries) {
      const entryPath = await join(dirPath, entry.name);
      if (entry.isDirectory) {
        total += await getDirSize(entryPath, readDir, stat, join);
      } else if (entry.isFile) {
        try {
          const s = await stat(entryPath);
          total += s.size;
        } catch {
          // Skip files we can't stat
        }
      }
    }
  } catch {
    // Directory might not exist
  }
  return total;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/** Compact row with status chip, counts, and a re-index button */
const IndexActionRow: React.FC<{
  label: string;
  indexed: number;
  total?: number;
  detail?: string;
  onReindex: () => void;
  busy: boolean;
  disabled: boolean;
}> = ({ label, indexed, total, detail, onReindex, busy, disabled }) => {
  const isFresh = total == null ? indexed > 0 : indexed >= total;
  const statusLabel = total == null
    ? (indexed > 0 ? 'Active' : 'Empty')
    : (indexed >= total ? 'Synced' : 'Stale');

  const chipClasses = isFresh
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <span className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading}`}>
            {label}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold leading-none tracking-wide uppercase ${chipClasses}`}>
            {statusLabel}
          </span>
          {total != null && (
            <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} font-mono`}>
              {indexed}/{total}
            </span>
          )}
        </div>
        {detail && (
          <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} mt-0.5`}>
            {detail}
          </p>
        )}
      </div>
      <button
        onClick={onReindex}
        disabled={disabled}
        className={`${COMPONENT.settingsButtonOutline} shrink-0`}
      >
        <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} />
        {busy ? 'Indexing…' : 'Re-index'}
      </button>
    </div>
  );
};

export default InterfacePanel;
