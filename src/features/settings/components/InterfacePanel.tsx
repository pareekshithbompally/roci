/**
 * InterfacePanel Component
 *
 * Settings for interface customization.
 * Self-contained — loads its own storage path state on mount.
 */

import React, { useState, useEffect } from 'react';
import { Sun, Moon, Monitor, Copy, Check, FolderOpen } from 'lucide-react';
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

  useEffect(() => {
    if (!isTauriEnvironment()) return;
    const load = async () => {
      try {
        const basePath = await pathsService.getBasePath();
        setStoragePath(basePath);
      } catch (error) {
        console.error('[InterfacePanel] Failed to resolve storage path:', error);
        setStoragePathError('Unable to resolve storage location.');
      }
    };
    load();
  }, []);

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
          Interface
        </h3>
        <p className={`${TYPOGRAPHY_CLASSES.settingsDescription} ${TEXT.muted}`}>
          Customize the look and feel of the application.
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
              onClick={handleCopyStoragePath}
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

export default InterfacePanel;
