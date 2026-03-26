/**
 * InterfacePanel Component
 *
 * Settings for interface customization.
 * Self-contained — loads its own storage path state on mount.
 */

import React, { useState, useEffect, useCallback } from 'react';
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
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  AlertDialog, AlertDialogPortal, AlertDialogOverlay, AlertDialogContent,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@shared/ui';
import { useSettingsSave } from '../hooks/useSettingsSave';

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
  const [isRebuilding, setIsRebuilding] = useState(false);
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

  const handleRebuildIndex = useCallback(async () => {
    setRebuildConfirmOpen(false);
    setIsRebuilding(true);

    try {
      const { vectorDB, ragIndexer, chatIndexer, emitProgress } = await import('@extensions/rag');

      // Wipe all vector + graph data (meetings + chats)
      await vectorDB.rebuild();

      const [meetingItems, chatSessions] = await Promise.all([
        searchIndexingService.loadMeetingsForIndexing(),
        searchIndexingService.loadChatsForIndexing(),
      ]);

      // Re-index all meetings (emits progress events → ActivityTray picks them up)
      const extractionContext = settings.chatModel
        ? { settings, providers }
        : undefined;
      const meetingsIndexed = await ragIndexer.indexAll(meetingItems, {
        includeEmbeddings: true,
        extractionContext,
      });

      // Re-index all chat sessions with progress
      let chatsIndexed = 0;
      if (chatSessions.length > 0) {
        emitProgress({ kind: 'indexing', status: 'started', total: chatSessions.length });
      }
      for (let i = 0; i < chatSessions.length; i++) {
        const session = chatSessions[i];
        emitProgress({
          kind: 'indexing',
          status: 'progress',
          current: i + 1,
          total: chatSessions.length,
          currentTitle: `Chat: ${session.title}`,
        });
        const result = await chatIndexer.indexSession(session, { includeEmbeddings: true });
        if (result.status === 'indexed') {
          chatsIndexed++;
        }
      }
      if (chatSessions.length > 0) {
        emitProgress({ kind: 'indexing', status: 'complete', current: chatsIndexed, total: chatSessions.length });
      }

      showToast(
        `Rebuilt index: ${meetingsIndexed}/${meetingItems.length} meetings, ${chatsIndexed}/${chatSessions.length} chats`,
        'success',
      );
    } catch (error: unknown) {
      console.error('[InterfacePanel] Rebuild index failed:', error);
      showToast(error instanceof Error ? error.message : 'Failed to rebuild index', 'error');
    } finally {
      setIsRebuilding(false);
      loadIndexStats();
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
    <div className={`${LAYOUT.settingsMaxWidth} mx-auto space-y-8`}>
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
          <div className={`flex items-center gap-2 p-3 ${SURFACE.card} border ${BORDER.default} ${RADIUS.lg}`}>
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
              <div key={label} className={`flex items-center justify-between px-3 py-2 ${TYPOGRAPHY_CLASSES.settingsInput}`}>
                <span className={TEXT.secondary}>{label}</span>
                <span className={`${TEXT.muted} font-mono`}>{formatBytes(bytes)}</span>
              </div>
            ))}
            <div className={`flex items-center justify-between px-3 py-2 ${TYPOGRAPHY_CLASSES.settingsInputLabel}`}>
              <span className={TEXT.heading}>Total</span>
              <span className={`${TEXT.heading} font-mono`}>
                {formatBytes(diskUsage.reduce((sum, d) => sum + d.bytes, 0))}
              </span>
            </div>
          </div>
        </SettingsSection>
      )}

      {/* Search Index */}
      {isTauriEnvironment() && (
        <SettingsSection title="Search Index">
          {/* Index Status */}
          {indexStats && (
            <div className={`${SURFACE.card} border ${BORDER.default} ${RADIUS.lg} divide-y ${BORDER.divide}`}>
              <IndexStatusRow
                label="Meetings"
                indexed={indexStats.meetings.indexed}
                total={indexStats.meetings.onDisk}
                detail={`${indexStats.chunks.transcript} transcript chunks`}
              />
              <IndexStatusRow
                label="Chats"
                indexed={indexStats.chats.indexed}
                total={indexStats.chats.onDisk}
                detail={`${indexStats.chunks.total - indexStats.chunks.transcript} chat chunks`}
              />
              <IndexStatusRow
                label="Knowledge Graph"
                indexed={indexStats.kg.nodes}
                detail={`${indexStats.kg.nodes} entities · ${indexStats.kg.edges} relationships`}
              />
            </div>
          )}

          {/* Rebuild button */}
          <div className={`flex items-center justify-between p-3 ${SURFACE.card} border ${BORDER.default} ${RADIUS.lg}`}>
            <div className="min-w-0 flex-1">
              <span className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading}`}>
                Rebuild Index
              </span>
              <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} mt-0.5`}>
                Clears and re-indexes all meetings and chats.
              </p>
            </div>
            <button
              onClick={() => setRebuildConfirmOpen(true)}
              disabled={isRebuilding}
              className={`flex items-center gap-1.5 px-3 py-1.5 ${TYPOGRAPHY_CLASSES.settingsButton} border ${BORDER.strong} ${RADIUS.lg} ${TEXT.primary} ${SURFACE.hoverSubtle} transition-colors disabled:opacity-40 disabled:pointer-events-none shrink-0 ml-4`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRebuilding ? 'animate-spin' : ''}`} />
              {isRebuilding ? 'Rebuilding…' : 'Rebuild'}
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
                    <button className={`px-3.5 py-2 ${TYPOGRAPHY_CLASSES.settingsButton} ${TEXT.primary} border ${BORDER.strong} rounded-lg ${SURFACE.hoverSubtle} transition-colors`}>
                      Cancel
                    </button>
                  </AlertDialogCancel>
                  <AlertDialogAction asChild>
                    <button
                      onClick={handleRebuildIndex}
                      className={`px-3.5 py-2 ${TYPOGRAPHY_CLASSES.settingsButton} ${COMPONENT.dangerButton} rounded-lg`}
                    >
                      Rebuild
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
        <div className={`flex items-center justify-between ${TYPOGRAPHY_CLASSES.settingsInput}`}>
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

/** Compact row showing indexed/total counts with a status chip */
const IndexStatusRow: React.FC<{
  label: string;
  indexed: number;
  total?: number;
  detail?: string;
}> = ({ label, indexed, total, detail }) => {
  const isFresh = total == null ? indexed > 0 : indexed >= total;
  const statusLabel = total == null
    ? (indexed > 0 ? 'Active' : 'Empty')
    : (indexed >= total ? 'Synced' : 'Stale');

  const chipClasses = isFresh
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <span className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading}`}>
            {label}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold leading-none tracking-wide uppercase ${chipClasses}`}>
            {statusLabel}
          </span>
        </div>
        {detail && (
          <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} mt-0.5`}>
            {detail}
          </p>
        )}
      </div>
      {total != null && (
        <span className={`${TYPOGRAPHY_CLASSES.settingsInput} ${TEXT.muted} font-mono shrink-0`}>
          {indexed}/{total}
        </span>
      )}
    </div>
  );
};

export default InterfacePanel;
