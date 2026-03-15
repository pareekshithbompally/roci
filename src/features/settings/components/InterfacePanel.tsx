/**
 * InterfacePanel Component
 *
 * Settings for interface customization.
 * Self-contained — loads its own storage path state on mount.
 */

import React, { useState, useEffect } from 'react';
import { Sun, Moon, Monitor, Copy, Check, FolderOpen, FolderSearch } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { isTauriEnvironment } from '@/services/tauri';
import { pathsService } from '@/services/storage';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { SURFACE, BORDER, TEXT, RADIUS } from '@config/theme.config';
import { SettingsSection } from './shared';

export const InterfacePanel: React.FC = () => {
  const { theme, setTheme } = useTheme();

  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [storagePathError, setStoragePathError] = useState<string | null>(null);
  const [storagePathCopied, setStoragePathCopied] = useState(false);
  const [diskUsage, setDiskUsage] = useState<{ label: string; bytes: number }[] | null>(null);

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
  }, []);

  const loadDiskUsage = async (basePath: string) => {
    try {
      const { readDir, stat } = await import('@tauri-apps/plugin-fs');
      const { join } = await import('@tauri-apps/api/path');

      const dirs = [
        { label: 'Meetings', name: 'meetings' },
        { label: 'Recordings', name: 'recordings' },
        { label: 'Chats', name: 'chats' },
        { label: 'Cache', name: 'cache' },
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
    <div className="space-y-8">
      <div>
        <h3 className={`${TYPOGRAPHY_CLASSES.settingsTitle} ${TEXT.heading} mb-1`}>
          System
        </h3>
        <p className={`${TYPOGRAPHY_CLASSES.settingsDescription} ${TEXT.muted}`}>
          Appearance, storage, and system information.
        </p>
      </div>

      {/* Theme Selection */}
      <SettingsSection title="Theme">
        <div className="grid grid-cols-3 gap-3">
          {themeOptions.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              role="radio"
              aria-checked={theme === id}
              onClick={() => setTheme(id)}
              className={`flex flex-col items-center gap-2 p-4 ${RADIUS.lg} border transition-all ${
                theme === id
                  ? `${SURFACE.selectedCard} ${BORDER.selectedCard}`
                  : `${SURFACE.card} ${BORDER.default} ${BORDER.cardHover}`
              }`}
            >
              <Icon className={`w-5 h-5 ${theme === id ? TEXT.heading : TEXT.faint}`} />
              <span className={`${TYPOGRAPHY_CLASSES.settingsButton} ${theme === id ? TEXT.heading : TEXT.muted}`}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </SettingsSection>

      {/* Storage Location */}
      {storagePath && (
        <SettingsSection title="Storage Location">
          <div className={`flex items-center gap-2 p-3 ${SURFACE.subtle} border ${BORDER.default} ${RADIUS.lg}`}>
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
          <div className={`${SURFACE.subtle} border ${BORDER.default} ${RADIUS.lg} divide-y ${BORDER.divide}`}>
            {diskUsage.map(({ label, bytes }) => (
              <div key={label} className={`flex items-center justify-between px-3 py-2 ${TYPOGRAPHY_CLASSES.settingsInput}`}>
                <span className={TEXT.secondary}>{label}</span>
                <span className={`${TEXT.muted} font-mono text-xs`}>{formatBytes(bytes)}</span>
              </div>
            ))}
            <div className={`flex items-center justify-between px-3 py-2 ${TYPOGRAPHY_CLASSES.settingsInput} font-medium`}>
              <span className={TEXT.heading}>Total</span>
              <span className={`${TEXT.heading} font-mono text-xs`}>
                {formatBytes(diskUsage.reduce((sum, d) => sum + d.bytes, 0))}
              </span>
            </div>
          </div>
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

export default InterfacePanel;
