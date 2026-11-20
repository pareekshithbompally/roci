/** Where Roci keeps its data, with Open in Finder and Copy; only where there is a file manager (a Mac). */

import React from 'react';
import { Check, Copy, FolderOpen } from 'lucide-react';
import { Button, Icon, Section, Text } from '@shared/ui';
import { AppIcon } from '@shared/components';
import { APP_CONFIG } from '@config/app.config';
import { useCopiedFlag } from '@shared/hooks';
import { revealInFinder } from '@services/tauri';
import { useSystemInfo } from '@features/settings/stores/systemInfoStore';
import { PENDING } from './shared';

export const StorageLocationSection: React.FC = () => {
  const { storagePath, storagePathError } = useSystemInfo();
  const { copied, markCopied } = useCopiedFlag();

  const openInFinder = async () => {
    if (!storagePath) return;
    try {
      await revealInFinder(storagePath);
    } catch (error: unknown) {
      console.error('[StorageLocationSection] Failed to open in Finder:', error);
    }
  };

  const copyPath = async () => {
    if (!storagePath) return;
    try {
      await navigator.clipboard.writeText(storagePath);
      markCopied();
    } catch (error: unknown) {
      console.error('[StorageLocationSection] Failed to copy storage path:', error);
    }
  };

  return (
    <Section title="Location">
      <div className="flex items-center gap-2 py-3">
        <Icon icon={FolderOpen} size="sm" tone="faint" className="shrink-0" />
        <Text tone="muted" truncate className="flex-1">{storagePath ?? PENDING}</Text>
        <Button variant="ghost" size="iconSm" onClick={openInFinder} aria-label="Open in Finder" title="Open in Finder" disabled={!storagePath}>
          <AppIcon app={APP_CONFIG.macApps.finder} size="sm" />
        </Button>
        <Button variant="ghost" size="iconSm" onClick={copyPath} aria-label="Copy path" disabled={!storagePath}>
          <Icon icon={copied ? Check : Copy} size="sm" tone={copied ? 'success' : 'faint'} />
        </Button>
      </div>
      {storagePathError && <Text as="p" variant="helper" tone="danger" className="py-3">{storagePathError}</Text>}
    </Section>
  );
};
